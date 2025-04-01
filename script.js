import './heart.js';

// Mapping for numeric weights to named weights.
const weightNames =
{
	'100': 'Thin',
	'200': 'Extra-Light',
	'300': 'Light',
	'400': 'Regular',
	'500': 'Medium',
	'600': 'Semi-Bold',
	'700': 'Bold',
	'800': 'Extra-Bold',
	'900': 'Black'
};

// ------------------------------
// Helper Functions and Globals
// ------------------------------
function wrapSelector(selector)
{
	selector = selector.trim();
	if ( selector.toLowerCase() === 'html' )
	{
		return 'html.previewerForGoogleFonts';
	}
	return 'html.previewerForGoogleFonts ' + selector;
}

function buildCustomCss(selector, fontFamily, fontWeight, fontStyle, fontSize, fontSizeUnit, extraFontStyle, textDecoration, textTransform)
{
	let css = `${selector}{font-family:'${fontFamily}' !important; font-weight:${fontWeight} !important;`;
	if ( extraFontStyle )
	{
		css += ` font-style:${extraFontStyle} !important;`;
	}
	else if ( fontStyle && fontStyle.trim() !== '' && fontStyle !== 'null' )
	{
		css += ` font-style:${fontStyle} !important;`;
	}
	if ( fontSize && fontSize.trim() !== '' )
	{
		css += ` font-size:${fontSize}${fontSizeUnit} !important;`;
	}
	if ( textDecoration )
	{
		css += ` text-decoration:${textDecoration} !important;`;
	}
	if ( textTransform )
	{
		css += ` text-transform:${textTransform} !important;`;
	}
	css += '}';
	return css;
}

let fullListUl = null;
let fontObserver = null;
let selectedFonts = { };
let selectedCSS = { };
let currentDomain = '';
let restoredState = null;

function getStyleId(selector)
{
	return 'previewer-font-' + selector.replace(/[^a-z0-9]/gi, '_');
}

function reapplySelectedFonts()
{
	for ( const sel in selectedFonts )
	{
		if ( selectedFonts.hasOwnProperty(sel) )
		{
			const { fontFamily, fontWeight, fontStyle, fontSize, fontSizeUnit, extraFontStyle, textDecoration, textTransform } = selectedFonts[sel];
			const fontUrlStart = 'https://fonts.googleapis.com/css2?family=';
			const italic = ( fontStyle === 'italic' || extraFontStyle === 'italic' ) ? 1 : 0;
			const fontUrl = fontUrlStart + encodeURIComponent(fontFamily) + ':ital,wght@' + italic + ',' + fontWeight;
			fetch(fontUrl)
			.then(response =>
			{
				return response.text();
			})
			.then(fontCss =>
			{
				const wrappedSelector = wrapSelector(sel);
				const customCss = buildCustomCss(wrappedSelector, fontFamily, fontWeight, fontStyle, fontSize, fontSizeUnit, extraFontStyle, textDecoration, textTransform);
				const fullCss = fontCss + customCss;
				chrome.tabs.query({ active: true, currentWindow: true }, tabs =>
				{
					const activeTab = tabs[0];
					const styleId = getStyleId(sel);
					chrome.scripting.executeScript(
					{
						target:
						{
							tabId: activeTab.id
						},
						func: (css, id) =>
						{
							let style = document.getElementById(id);
							if ( ! style )
							{
								style = document.createElement('style');
								style.id = id;
								document.head.appendChild(style);
							}
							style.textContent = css;
							document.documentElement.classList.add('previewerForGoogleFonts');
						},
						args: [fullCss, styleId]
					});
				});
			})
			.catch(error =>
			{
				console.error(error);
			});
		}
	}
}

function removeInjectedFontStyle(selector, callback)
{
	chrome.tabs.query({ active: true, currentWindow: true }, tabs =>
	{
		const activeTab = tabs[0];
		const styleId = getStyleId(selector);
		chrome.scripting.executeScript(
		{
			target:
			{
				tabId: activeTab.id
			},
			func: (id) =>
			{
				const style = document.getElementById(id);
				if ( style )
				{
					style.remove();
					void document.documentElement.offsetHeight;
				}
			},
			args: [styleId]
		}, callback);
	});
}

function toTitleCase(str)
{
	return str.replace(/\w\S*/g, txt =>
	{
		return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
	});
}

function setStorageData(key, value)
{
	chrome.storage.local.set({ [key]: value });
}

/**
 * Given an array of variant strings from the Google Fonts JSON
 * (e.g. ['100','100italic','300','400','700italic'...]),
 * build a single string of (ital,wght) pairs for the CSS2 url,
 * e.g. '0,100;1,100;0,300;0,400;1,700'
 */
function buildVariantsString(variantsArray)
{
	const pairs = [ ];
	variantsArray.forEach(variant =>
	{
		const isItalic = variant.includes('italic');
		const weight = variant.replace(/\D/g, '') || '400';
		const italNum = isItalic ? '1' : '0';
		pairs.push(`${italNum},${weight}`);
	});
	return pairs.join(';');
}


// ====================================
// Persistence: Saving & Restoring State
// ====================================
function getTopVisibleFontIndex()
{
	const container = document.querySelector('#findSection .scroller.filterable');
	if ( ! container )
	{
		return null;
	}
	const containerRect = container.getBoundingClientRect();
	const items = container.querySelectorAll('li.parent');
	for (const li of items)
	{
		const liRect = li.getBoundingClientRect();
		if ( liRect.bottom > containerRect.top )
		{
			return li.getAttribute('data-font-index');
		}
	}
	return null;
}

function updatePersistentState()
{
	const state = { };
	state.searchInput = document.getElementById('searchInput').value;
	state.categoryFilter = document.getElementById('categoryFilter').value;
	state.weightFilter = document.getElementById('weightFilter').value;
	state.selectorInput = document.getElementById('selectorInput').value;
	state.topVisibleFont = getTopVisibleFontIndex();
	chrome.storage.local.set({ ['popupState_' + currentDomain]: state });
}


// ====================================
// Filtering & Preloader Functions
// ====================================
function updateFilter()
{
	showPreloader();
	return new Promise(resolve =>
	{
		requestAnimationFrame(() =>
		{
			const searchText = (document.getElementById('searchInput').value || '').toLowerCase();
			const category = document.getElementById('categoryFilter').value || 'none';
			const weight = document.getElementById('weightFilter').value || 'none';
			performFiltering(searchText, category, weight);
			requestAnimationFrame(() =>
			{
				resolve();
			});
		});
	});
}

function restoreTopFont()
{
	return new Promise(resolve =>
	{
		if (restoredState && restoredState.topVisibleFont)
		{
			const target = fullListUl.querySelector(`li.parent[data-font-index="${restoredState.topVisibleFont}"]`);
			if (target)
			{
				target.scrollIntoView({ block: 'start' });
			}
		}
		requestAnimationFrame(() =>
		{
			restoredState = null;
			resolve();
		});
	});
}

function runFilterChain()
{
	updateFilter()
		.then(() =>
		{
			if (restoredState && restoredState.topVisibleFont)
			{
				return restoreTopFont();
			}
			return Promise.resolve();
		})
		.then(() =>
		{
			hidePreloader();
			updatePersistentState();
		});
}


// ====================================
// Event Handlers and Initialization
// ====================================
document.addEventListener('DOMContentLoaded', () =>
{
	document.getElementById('tabFind').classList.add('active');
	document.getElementById('findSection').classList.add('active');
	document.getElementById('selectedSection').classList.remove('active');
	document.getElementById('favoritesSection').classList.remove('active');
	chrome.tabs.query({ active: true, currentWindow: true }, tabs =>
	{
		const tabUrl = tabs[0].url;
		const urlObj = new URL(tabUrl);
		currentDomain = urlObj.host;
		const headerEl = document.getElementById('selectedHeader');
		if ( headerEl )
		{
			headerEl.textContent = currentDomain;
		}
		chrome.storage.local.get(
		[
			'selectedFonts_' + currentDomain,
			'keepApplied_' + currentDomain,
			'popupState_' + currentDomain
		],
		result =>
		{
			selectedFonts = result['selectedFonts_' + currentDomain] || { };
			const keepApplied = result['keepApplied_' + currentDomain];
			updateSelectedList();
			const checkbox = document.getElementById('keepAppliedCheckbox');
			if (checkbox)
			{
				checkbox.checked = (keepApplied === true);
			}
			if (Object.keys(selectedFonts).length > 0)
			{
				reapplySelectedFonts();
			}
			const popupState = result['popupState_' + currentDomain];
			if (popupState)
			{
				restoredState = popupState;
			}
		});
	});
	RequestFontsJSON();
	const searchInput = document.getElementById('searchInput');
	const categorySelect = document.getElementById('categoryFilter');
	const weightSelect = document.getElementById('weightFilter');
	const selectorInput = document.getElementById('selectorInput');
	const favoritesContainer = document.getElementById('favoritesList');
	const keepAppliedCheckbox = document.getElementById('keepAppliedCheckbox');
	if ( searchInput )
	{
		searchInput.addEventListener('keyup', runFilterChain);
	}
	if ( categorySelect )
	{
		categorySelect.addEventListener('change', runFilterChain);
	}
	if ( weightSelect )
	{
		weightSelect.addEventListener('change', runFilterChain);
	}
	if ( selectorInput )
	{
		selectorInput.addEventListener('change', () =>
		{
			const selectorInputBottom = document.getElementById('selectorInputBottom');
			if ( selectorInputBottom )
			{
				selectorInputBottom.value = selectorInput.value;
			}
			updatePersistentState();
		});
	}
	const selectorInputBottom = document.getElementById('selectorInputBottom');
	if ( selectorInputBottom )
	{
		selectorInputBottom.addEventListener('change', () =>
		{
			const selectorInput = document.getElementById('selectorInput');
			if ( selectorInput )
			{
				selectorInput.value = selectorInputBottom.value;
			}
			updatePersistentState();
		});
	}
	if ( keepAppliedCheckbox )
	{
		keepAppliedCheckbox.addEventListener('change', () =>
		{
			chrome.storage.local.set({ ['keepApplied_' + currentDomain]: keepAppliedCheckbox.checked });
		});
	}

    document.addEventListener('favorite-toggle', e =>
    {
        e.stopPropagation();
        const { favorited, fontName } = e.detail;
        document.querySelectorAll(`favorite-heart[data-font-name="${fontName}"]`).forEach(el =>
        {
            // If the element has a dedicated update method, use it:
            if (typeof el.setFavorited === 'function')
            {
                el.setFavorited(favorited);
            }
            else
            {
                el.setAttribute('data-favorited', favorited);
            }
        });

		const favoritesContainer = document.getElementById('favoritesList');
		if ( favorited )
		{
			if ( !document.querySelector(`ul.favorites li[data-font-name="${fontName}"]`) )
			{
				const parentLi = document.querySelector(`ul.full-list li.parent[data-font-name="${fontName}"]`);
				if ( parentLi )
				{
					const clone = parentLi.cloneNode(true);
					const heart = clone.querySelector('favorite-heart');
					if ( heart )
					{
						heart.setAttribute('data-favorited', 'true');
					}
					if ( favoritesContainer )
					{
						favoritesContainer.appendChild(clone);
						favoritesContainer.querySelectorAll('li').forEach(li =>
						{
							li.classList.remove('open');
						});
					}
				}
			}
		}
		else
		{
			document.querySelectorAll(`ul.favorites li[data-font-name="${fontName}"]`).forEach(el =>
			{
				el.remove();
			});
		}
		updateFavoritesList();
		updatePersistentState();
    });

	document.addEventListener('click', e =>
	{
		if ( e.target.closest('#selectedFontsList') )
		{
			return;
		}
		const li = e.target.closest('li');
		if ( ! li )
		{
			return;
		}
		e.stopPropagation();
		if ( li.classList.contains('selectable') )
		{
			const scroller = li.closest('div.scroller');
			if ( li.classList.contains('variant') || (scroller && ! scroller.classList.contains('weightFiltered')) )
			{
				if ( li.classList.contains('selected') )
				{
					li.classList.remove('selected');
				}
				else
				{
					const fontUrlStart = 'https://fonts.googleapis.com/css2?family=';
					const fontName = li.getAttribute('data-font-name');
					let fontUrl = fontUrlStart + encodeURIComponent(fontName) + ':ital,wght@';
					const fontWeight = li.getAttribute('data-font-weight');
					const fontStyle = li.getAttribute('data-font-style');
					const italic = fontStyle === 'italic' ? 1 : 0;
					fontUrl += italic + ',' + fontWeight;
					const selectorValue = (selectorInput ? selectorInput.value.trim() : '') || '*';
					appendTargetPage(fontName, fontUrl, fontWeight, fontStyle, '', 'px');
					updateSelectedFonts(selectorValue, fontName, fontWeight, fontStyle, '', 'px');
				}
			}
		}
		else
		{
			const scroller = li.closest('div.scroller');
			if ( scroller && ! scroller.classList.contains('weightFiltered') )
			{
				li.classList.toggle('open');
				if ( li.classList.contains('open') )
				{
					const variantsDiv = li.querySelector('div.variants');
					if ( variantsDiv && ! variantsDiv.classList.contains('loaded') )
					{
						loadVariantStyles(li);
					}
				}
			}
		}
		updatePersistentState();
	});
	document.querySelectorAll('div.tabs > div').forEach(tab =>
	{
		tab.addEventListener('click', function ()
		{
			document.querySelectorAll('div.tabs > div').forEach(el =>
			{
				el.classList.remove('active');
			});
			this.classList.add('active');
			if ( this.id === 'tabFind' )
			{
				document.getElementById('findSection').classList.add('active');
				document.getElementById('selectedSection').classList.remove('active');
				document.getElementById('favoritesSection').classList.remove('active');
			}
			else if ( this.id === 'tabSelected' )
			{
				document.getElementById('selectedSection').classList.add('active');
				document.getElementById('findSection').classList.remove('active');
				document.getElementById('favoritesSection').classList.remove('active');
			}
			else if ( this.id === 'tabFavorites' )
			{
				document.getElementById('favoritesSection').classList.add('active');
				document.getElementById('findSection').classList.remove('active');
				document.getElementById('selectedSection').classList.remove('active');
			}
			updatePersistentState();
		});
	});
	document.querySelectorAll('.clearAll').forEach(el =>
	{
		el.addEventListener('click', function ()
		{
			if ( confirm('Clear everything from the extension cache?') )
			{
				const fieldDiv = this.closest('div.field');
				const message = fieldDiv ? fieldDiv.querySelector('p.success') : null;
				chrome.storage.local.clear(() =>
				{
					if ( message )
					{
						message.style.display = 'block';
						setTimeout(() =>
						{
							message.style.display = 'none';
						}, 2000);
					}
				});
			}
		});
	});
	const findScroller = document.querySelector('#findSection .scroller.filterable');
	if (findScroller)
	{
		findScroller.addEventListener('scroll', updatePersistentState);
	}
	const selectedScroller = document.querySelector('#selectedSection .scroller');
	if (selectedScroller)
	{
		selectedScroller.addEventListener('scroll', updatePersistentState);
	}
	const favoritesScroller = document.querySelector('#favoritesSection .scroller');
	if (favoritesScroller)
	{
		favoritesScroller.addEventListener('scroll', updatePersistentState);
	}

    chrome.storage.onChanged.addListener((changes, area) =>
    {
        if (area === 'local')
        {
            if (changes['favorite-fonts'] || changes[`selectedFonts_${currentDomain}`])
            {
                updateBadgeCounts();
            }
        }
    });
});

function updateBadgeCounts()
{
	chrome.storage.local.get('selectedFonts_' + currentDomain, result =>
	{
		var selectedFonts = result['selectedFonts_' + currentDomain] || {};
		var selectedCount = Object.keys(selectedFonts).length;
		updateBadge('#tabSelected', selectedCount);
	});

	chrome.storage.local.get('favorite-fonts', result =>
	{
		var favorites = result['favorite-fonts'] || [];
		var favoritesCount = favorites.length;
		updateBadge('#tabFavorites', favoritesCount);
	});
}

function updateBadge(parentSelector, count)
{
	var parent = document.querySelector(parentSelector);
	if ( count === 0 )
	{
		var badge = parent.querySelector('.badge');
		if ( badge )
		{
			badge.remove();
		}
	}
	else
	{
		var badge = parent.querySelector('.badge');
		if ( ! badge )
		{
			badge = document.createElement('span');
			badge.className = 'badge';
			parent.appendChild(badge);
		}
		badge.textContent = count;
	}
}


// ====================================
// Filtering & Preloader Functions (continued)
// ====================================

function performFiltering(searchText, category, weight)
{
	fullListUl.querySelectorAll('li.parent').forEach(li =>
	{
		const fontName = li.getAttribute('data-lowercase') || '';
		const fontCategory = li.getAttribute('data-category') || '';
		const variantWeights = li.getAttribute('data-variant-weights') || '';
		const matchesSearch = (searchText === '') || fontName.includes(searchText);
		const matchesCategory = (category === 'none') || (fontCategory === category);
		const matchesWeight = (weight === 'none') || variantWeights.includes(weight);
		if (matchesSearch && matchesCategory && matchesWeight)
		{
			li.style.display = '';
			if ( weight !== 'none' )
			{
				li.classList.add('open');
				const variantsDiv = li.querySelector('div.variants');
				if ( variantsDiv )
				{
					if ( ! variantsDiv.classList.contains('loaded') &&
						! variantsDiv.innerHTML.trim() &&
						variantsDiv.getAttribute('data-variants') )
					{
						loadVariantStyles(li);
					}
					variantsDiv.querySelectorAll('li').forEach(variant =>
					{
						if ( variant.getAttribute('data-font-weight') === weight )
						{
							variant.style.display = '';
						}
						else
						{
							variant.style.display = 'none';
						}
					});
				}
			}
			else
			{
				li.classList.remove('open');
			}
		}
		else
		{
			li.style.display = 'none';
		}
	});
}

function showPreloader()
{
	const container = document.querySelector('.scroller.filterable');
	if (container)
	{
		let overlay = document.getElementById('preloader-overlay');
		if ( ! overlay )
		{
			overlay = document.createElement('div');
			overlay.id = 'preloader-overlay';
			overlay.innerHTML = "<div class='spinner'></div>";
			container.appendChild(overlay);
		}
	}
}

function hidePreloader()
{
	const overlay = document.getElementById('preloader-overlay');
	if (overlay)
	{
		overlay.remove();
	}
}


// ====================================
// Font List Building and Utilities
// ====================================
function RequestFontsJSON()
{
	fetch('https://www.googleapis.com/webfonts/v1/webfonts?key=AIzaSyCbTrNnpZwQAQhL4mFvPHLzDVaGBTh1IWE')
    .then(response => response.json())
    .then(data =>
    {
        console.log('Loaded font JSON from Google');
        loadPage(data);
    })
    .catch(error => console.error(error));
}

function loadPage(data)
{
    chrome.storage.local.get(['favorite-fonts', 'selectedFonts_' + currentDomain], (result) =>
    {
        if ( result )
        {
            const favorites = result['favorite-fonts'] || [];
            const selectedObj = result['selectedFonts_' + currentDomain] || {};
            const selectedFontNames = Object.values(selectedObj).map((obj) =>
            {
                return obj.fontFamily;
            });
            const allNeeded = new Set([ ...favorites, ...selectedFontNames ]);
            allNeeded.forEach((fontName) =>
            {
                const fontItem = data.items.find((f) =>
                {
                    return f.family === fontName;
                });
                if ( fontItem )
                {
                    const fullVariants = buildVariantsString(fontItem.variants);
                    const cssUrl = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(fontItem.family) + ':ital,wght@' + fullVariants + '&display=swap';
                    const link = document.createElement('link');
                    link.rel = 'stylesheet';
                    // Force load the font immediately by setting href
                    link.href = cssUrl;
                    link.setAttribute('data-immediate', fontName);
                    document.head.appendChild(link);
                }
            });
        }
    });
	let fontUrlList = '';
	const fontUrlStart = 'https://fonts.googleapis.com/css2';
	let j = 1, k = 1;
	fullListUl = document.getElementById('fullList');
	if ( !fullListUl )
	{
		return;
	}
	fullListUl.innerHTML = '';
	const categoryList = [ ];
	for ( let i = 0; i < data.items.length; i++ )
	{
		const font = data.items[i];
		if ( font.subsets.includes('latin') )
		{
			let variantWeightList = [ ];
			let variantHtml = '';
			let dataVariants = '';
			if ( font.variants.length > 1 )
			{
				let variantsArray = [ ];
				for (let v = 0; v < font.variants.length; v++)
				{
					const variant = font.variants[v];
					const fontStyle = variant.includes('italic') ? 'italic' : 'normal';
					const weightMatch = variant.replace(/\D/g, '');
					const fontWeight = weightMatch ? weightMatch : '400';
					if ( ! variantWeightList.includes(fontWeight) )
					{
						variantWeightList.push(fontWeight);
					}
					const namedWeight = weightNames[fontWeight] || '';
					variantsArray.push({ fontWeight, fontStyle, namedWeight });
				}
				dataVariants = JSON.stringify(variantsArray);
			}
			const variantWeightString = variantWeightList.join();
			const actionClass = (font.variants.length === 1) ? 'selectable' : 'hasVariants';
			const catLower = font.category.toLowerCase();
			const fontHtml = `
            <li
                data-font-name="${font.family}"
                data-font-weight="400"
                data-variant-weights="${variantWeightString}"
                data-font-index="${i}"
                data-category="${catLower}"
                data-lowercase="${font.family.toLowerCase()}"
                class="${actionClass} icon parent"
                style="font-family:'${font.family}'"
            >
                <span class="fontName familyName">${font.family}</span>
                <favorite-heart data-font-name="${font.family}"></favorite-heart>
                <span class="fontStyles">
                    ${font.variants.length} ${font.variants.length === 1 ? 'style' : 'styles'}
                </span>
                <div class="variants" ${font.variants.length > 1 ? "data-variants='" + dataVariants + "'" : ''}>
                </div>
            </li>`;
			fullListUl.insertAdjacentHTML('beforeend', fontHtml);
			if ( ! categoryList.includes(catLower) )
			{
				categoryList.push(catLower);
			}
			const fontUrlSymbol = j === 1 ? '?' : '&';
			fontUrlList += fontUrlSymbol + 'family=' + encodeURIComponent(font.family);
			if ( j === 50 )
			{
				const fontUrl = fontUrlStart + fontUrlList;
				createFontStyles(fontUrl, k);
				fontUrlList = '';
				j = 0;
				k++;
			}
			j++;
		}
	}
	if ( j > 0 && fontUrlList )
	{
		const fontUrl = fontUrlStart + fontUrlList;
		createFontStyles(fontUrl, k);
	}
	createFilterOptions(weightNames, 'weight', 'weights');
	createFilterOptions(categoryList.sort(), 'category', 'categories');
	if ( restoredState )
	{
		if (document.getElementById('searchInput'))
		{
			document.getElementById('searchInput').value = restoredState.searchInput || '';
		}
		if (document.getElementById('categoryFilter'))
		{
			document.getElementById('categoryFilter').value = restoredState.categoryFilter || 'none';
		}
		if (document.getElementById('weightFilter'))
		{
			document.getElementById('weightFilter').value = restoredState.weightFilter || 'none';
		}
		if (document.getElementById('selectorInput'))
		{
			document.getElementById('selectorInput').value = restoredState.selectorInput || '';
		}
		if (document.getElementById('selectorInputBottom'))
		{
			document.getElementById('selectorInputBottom').value = restoredState.selectorInput || '';
		}
	}
	setupFontObserver();
	loadFavoritesList();
	updateFilter()
    .then(() =>
    {
        if (restoredState && restoredState.topVisibleFont)
        {
            restoreTopFont();
        }
    })
    .then(() =>
    {
        hidePreloader();
    });
}

function setupFontObserver()
{
    if ( !fullListUl )
    {
        return;
    }
    fontObserver = new IntersectionObserver((entries, observer) =>
    {
        entries.forEach(entry =>
        {
            if ( entry.isIntersecting )
            {
                setTimeout(() =>
                {
                    const rect = entry.target.getBoundingClientRect();
                    if ( rect.bottom < 0 || rect.top > window.innerHeight )
                    {
                        return;
                    }
                    const li = entry.target;
                    const indexStr = li.getAttribute('data-font-index');
                    if ( indexStr )
                    {
                        const index = parseInt(indexStr, 10);
                        const batch = Math.floor(index / 50) + 1;
                        activateFontStyles(batch);

                        const fontName = li.getAttribute('data-font-name');
                        if ( fontName )
                        {
                            const cachedLink = document.querySelector(`link[data-immediate="${fontName}"]`);
                            if (cachedLink && cachedLink.getAttribute('href') === "")
                            {
                                const cssUrl = cachedLink.getAttribute('data-url');
                                cachedLink.href = cssUrl;
                            }
                        }
                        observer.unobserve(li);
                }
                }, 100);
            }
        });
    }, { threshold: 0 });
    fullListUl.querySelectorAll('li:not(.loaded)').forEach(li =>
    {
        fontObserver.observe(li);
    });
}

function activateBatch(index)
{
	const stylesheet = document.querySelector(`link[data-index="${index}"]`);
	if ( stylesheet && stylesheet.getAttribute('href') === '' )
	{
		const fontUrl = stylesheet.getAttribute('data-url');
		stylesheet.href = fontUrl;
		stylesheet.onload = () =>
		{
			const entries = performance.getEntriesByName(fontUrl);
			if ( entries && entries.length > 0 )
			{
				const entry = entries[0];
				if ( entry.transferSize === 0 )
				{
					console.log(`Font batch ${index} loaded from cache.`);
				}
				else
				{
					console.log(`Font batch ${index} loaded from network.`);
				}
			}
			else
			{
				console.log(`Font batch ${index} loaded.`);
			}
		};

		const increment = 50;
		const items = fullListUl.querySelectorAll('li');
		for (let i = (index - 1) * increment; i < index * increment; i++)
		{
			if ( items[i] )
			{
				items[i].classList.add('loaded');
			}
		}
	}
}

function activateFontStyles(index)
{
    activateBatch(index - 1);
	activateBatch(index);
	activateBatch(index + 1);
	activateBatch(index + 2);
}

function createFontStyles(fontUrl, index)
{
	const link = document.createElement('link');
	link.rel = 'stylesheet';
	link.type = 'text/css';
	link.setAttribute('data-index', index);
	link.setAttribute('data-url', fontUrl);
	link.href = '';
	document.head.appendChild(link);
}

function createFilterOptions(options, name, namePlural)
{
	let html = `<option value='none'>All ${toTitleCase(namePlural)}</option>`;
	if ( Array.isArray(options) )
	{
		options.forEach(option =>
		{
			if ( name === 'category' )
			{
				html += `<option value='${option.toLowerCase()}'>${toTitleCase(option)}</option>`;
			}
			else
			{
				html += `<option value='${option}'>${toTitleCase(option)}</option>`;
			}
		});
	}
	else
	{
		for (let key in options)
		{
			if ( options.hasOwnProperty(key) )
			{
				if ( name === 'category' )
				{
					html += `<option value='${key.toLowerCase()}'>${toTitleCase(options[key])}</option>`;
				}
				else
				{
					html += `<option value='${key}'>${toTitleCase(options[key])}</option>`;
				}
			}
		}
	}
	const selectEl = document.getElementById(name === 'weight' ? 'weightFilter' : 'categoryFilter');
	if ( selectEl )
	{
		selectEl.innerHTML = html;
	}
}

function loadFavoritesList()
{
	chrome.storage.local.get('favorite-fonts', result =>
	{
		const favorites = result['favorite-fonts'] || [];
		if ( favorites !== undefined )
		{
			favorites.forEach(favorite =>
			{
				document.querySelectorAll(`li[data-font-name='${favorite}'] favorite-heart`).forEach(el =>
				{
					el.setAttribute('data-favorited', 'true');
				});
				const parentLi = document.querySelector(`li.parent[data-font-name='${favorite}']`);
				if ( parentLi )
				{
					const clone = parentLi.cloneNode( true );
					clone.style.display = '';
					clone.classList.remove('open');
					const favUl = document.getElementById('favoritesList');
					if ( favUl )
					{
						favUl.appendChild(clone);
					}
				}
			});
		}
	});
}

function updateFavoritesList()
{
	const favorites = [ ];
	fullListUl.querySelectorAll('li').forEach(li =>
	{
		if ( li.querySelector("favorite-heart[data-favorited='true']") )
		{
			const fontNameSpan = li.querySelector('span.fontName');
			if ( fontNameSpan )
			{
				favorites.push(fontNameSpan.textContent);
			}
		}
	});
	setStorageData('favorite-fonts', favorites);
	updateBadgeCounts();
}

function updateSelectedFonts(selector, fontName, fontWeight, fontStyle, fontSize = '', fontSizeUnit = 'px')
{
	let availableWeights = [ ];
	const parentLi = document.querySelector(`li.parent[data-font-name="${fontName}"]`);
	if ( parentLi )
	{
		const weightAttr = parentLi.getAttribute('data-variant-weights');
		if ( weightAttr )
		{
			availableWeights = weightAttr.split(',');
		}
	}
	if ( availableWeights.length === 0 )
	{
		availableWeights = [fontWeight];
	}
	selectedFonts[selector] =
	{
		fontFamily: fontName,
		fontWeight,
		fontStyle,
		fontSize,
		fontSizeUnit,
		availableWeights
	};
	updateSelectedList();
	chrome.storage.local.set({ ['selectedFonts_' + currentDomain]: selectedFonts });
	if ( document.getElementById('keepAppliedCheckbox').checked )
	{
		reapplySelectedFonts();
	}
}

function updateSelectedList()
{
	const selectedContainer = document.getElementById('selectedFontsList');
	if ( ! selectedContainer )
	{
		return;
	}
	selectedContainer.innerHTML = '';
	for (let sel in selectedFonts)
	{
		if ( ! selectedFonts.hasOwnProperty(sel) )
		{
			continue;
		}
		const { fontFamily, fontWeight, fontStyle, fontSize, fontSizeUnit } = selectedFonts[sel];
		const container = document.createElement('div');
		container.classList.add('selectedFontContainer');
		const topRow = document.createElement('div');
		topRow.classList.add('selectedFontRowTop');
		const selectorCell = document.createElement('span');
		selectorCell.classList.add('selectorCell');
		selectorCell.textContent = (sel === '*') ? 'all' : sel;
		selectorCell.style.flex = '1';
		topRow.appendChild(selectorCell);
		const controlsContainer = document.createElement('div');
		controlsContainer.classList.add('controlsContainer');
		controlsContainer.style.marginLeft = 'auto';
		controlsContainer.style.display = 'flex';
		controlsContainer.style.alignItems = 'center';
		controlsContainer.style.gap = '10px';
        
		const weightCell = document.createElement('span');
		weightCell.classList.add('fontWeightCell');
		const availableWeights = selectedFonts[sel].availableWeights || [fontWeight];
		const weightSelect = document.createElement('select');
		weightSelect.classList.add('fontWeightSelect');
        weightSelect.classList.add('selectedSelect');
		weightSelect.setAttribute('autocomplete', 'off');
		if ( availableWeights.length === 1 )
		{
			weightSelect.classList.add('single-option');
			weightSelect.setAttribute('disabled', 'disabled');
		}
		availableWeights.forEach(wt =>
		{
			const option = document.createElement('option');
			option.value = wt;
			option.textContent = weightNames[wt] || wt;
			if ( wt === fontWeight )
			{
				option.selected = true;
			}
			weightSelect.appendChild(option);
		});
		weightSelect.addEventListener('change', function ()
		{
			selectedFonts[sel].fontWeight = this.value;
			chrome.storage.local.set({ ['selectedFonts_' + currentDomain]: selectedFonts });
			reapplySelectedFonts();
			fontNameSpan.style.fontWeight = this.value;
		});
		weightCell.appendChild(weightSelect);
		controlsContainer.appendChild(weightCell);

        const optionsCell = document.createElement('span');
        optionsCell.classList.add('fontOptionsCell');
        const optionsSelect = document.createElement('select');
        optionsSelect.classList.add('fontOptionsSelect');
        optionsSelect.classList.add('selectedSelect');
        optionsSelect.setAttribute('autocomplete', 'off');
        const fontOptions = [
            { value: 'normal', label: 'Normal' },
            { value: 'italic', label: 'Italic' },
            { value: 'underline', label: 'Underline' },
            { value: 'lowercase', label: 'Lowercase' },
            { value: 'uppercase', label: 'Uppercase' }
        ];
        fontOptions.forEach(opt =>
        {
            const optionEl = document.createElement('option');
            optionEl.value = opt.value;
            optionEl.textContent = opt.label;
            if ( opt.value === 'normal' )
            {
                optionEl.selected = true;
            }
            optionsSelect.appendChild(optionEl);
        });
        optionsSelect.addEventListener('change', function ()
        {
            const selectedOpt = this.value;
            if ( selectedOpt === 'italic' )
            {
                selectedFonts[sel].extraFontStyle = 'italic';
                delete selectedFonts[sel].textDecoration;
                delete selectedFonts[sel].textTransform;
                fontNameSpan.style.fontStyle = 'italic';
                fontNameSpan.style.textDecoration = '';
                fontNameSpan.style.textTransform = '';
            }
            else if ( selectedOpt === 'underline' )
            {
                selectedFonts[sel].textDecoration = 'underline';
                delete selectedFonts[sel].extraFontStyle;
                delete selectedFonts[sel].textTransform;
                fontNameSpan.style.textDecoration = 'underline';
                fontNameSpan.style.fontStyle = '';
                fontNameSpan.style.textTransform = '';
            }
            else if ( selectedOpt === 'lowercase' )
            {
                selectedFonts[sel].textTransform = 'lowercase';
                delete selectedFonts[sel].extraFontStyle;
                delete selectedFonts[sel].textDecoration;
                fontNameSpan.style.textTransform = 'lowercase';
                fontNameSpan.style.fontStyle = '';
                fontNameSpan.style.textDecoration = '';
            }
            else if ( selectedOpt === 'uppercase' )
            {
                selectedFonts[sel].textTransform = 'uppercase';
                delete selectedFonts[sel].extraFontStyle;
                delete selectedFonts[sel].textDecoration;
                fontNameSpan.style.textTransform = 'uppercase';
                fontNameSpan.style.fontStyle = '';
                fontNameSpan.style.textDecoration = '';
            }
            else
            {
                delete selectedFonts[sel].extraFontStyle;
                delete selectedFonts[sel].textDecoration;
                delete selectedFonts[sel].textTransform;
                fontNameSpan.style.fontStyle = '';
                fontNameSpan.style.textDecoration = '';
                fontNameSpan.style.textTransform = '';
            }
            chrome.storage.local.set({ ['selectedFonts_' + currentDomain]: selectedFonts });
            reapplySelectedFonts();
        });
        optionsCell.appendChild(optionsSelect);
        controlsContainer.appendChild(optionsCell);

		const sizeCell = document.createElement('span');
		sizeCell.classList.add('fontSizeCell');
		const sizeInput = document.createElement('input');
		sizeInput.type = 'text';
		sizeInput.inputMode = 'numeric';
		sizeInput.classList.add('fontSize');
		sizeInput.placeholder = 'Size';
		sizeInput.value = fontSize || '';
		sizeInput.setAttribute('autocomplete', 'off');
        sizeInput.setAttribute('autocorrect', 'off');
        sizeInput.setAttribute('autocapitalize', 'off');
        sizeInput.setAttribute('spellcheck', 'false');
		sizeInput.addEventListener('change', function ()
		{
			selectedFonts[sel].fontSize = this.value;
			chrome.storage.local.set({ ['selectedFonts_' + currentDomain]: selectedFonts });
			reapplySelectedFonts();
		});
		sizeCell.appendChild(sizeInput);

		const unitSelect = document.createElement('select');
		unitSelect.classList.add('fontSizeUnit');
		unitSelect.setAttribute('autocomplete', 'off');
		['px', 'pt', 'em', 'rem', '%'].forEach(unit =>
		{
			const option = document.createElement('option');
			option.value = unit;
			option.textContent = unit;
			if ( unit === fontSizeUnit )
			{
				option.selected = true;
			}
			unitSelect.appendChild(option);
		});
		unitSelect.addEventListener('change', function ()
		{
			selectedFonts[sel].fontSizeUnit = this.value;
			chrome.storage.local.set({ ['selectedFonts_' + currentDomain]: selectedFonts });
			reapplySelectedFonts();
		});
		sizeCell.appendChild(unitSelect);
		controlsContainer.appendChild(sizeCell);

		const heartHtml = `<span class='heartCell'><favorite-heart data-font-name='${fontFamily}'></favorite-heart></span>`;
		controlsContainer.insertAdjacentHTML('beforeend', heartHtml);
		const googleFontUrl = 'https://fonts.google.com/specimen/' + encodeURIComponent(fontFamily.replace(/\s+/g, '+'));
		const linkCell = document.createElement('span');
		linkCell.classList.add('linkCell');
		linkCell.innerHTML = `
        <a href="${googleFontUrl}" target="_blank" title="View in Google Fonts" style="display: inline-block;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill-rule="evenodd" clip-rule="evenodd"><path d="M14.851 11.923c-.179-.641-.521-1.246-1.025-1.749-1.562-1.562-4.095-1.563-5.657 0l-4.998 4.998c-1.562 1.563-1.563 4.095 0 5.657 1.562 1.563 4.096 1.561 5.656 0l3.842-3.841.333.009c.404 0 .802-.04 1.189-.117l-4.657 4.656c-.975.976-2.255 1.464-3.535 1.464-1.28 0-2.56-.488-3.535-1.464-1.952-1.951-1.952-5.12 0-7.071l4.998-4.998c.975-.976 2.256-1.464 3.536-1.464 1.279 0 2.56.488 3.535 1.464.493.493.861 1.063 1.105 1.672l-.787.784zm-5.703.147c.178.643.521 1.25 1.026 1.756 1.562 1.563 4.096 1.561 5.656 0l4.999-4.998c1.563-1.562 1.563-4.095 0-5.657-1.562-1.562-4.095-1.563-5.657 0l-3.841 3.841-.333-.009c-.404 0-.802.04-1.189.117l4.656-4.656c.975-.976 2.256-1.464 3.536-1.464 1.279 0 2.56.488 3.535 1.464 1.951 1.951 1.951 5.119 0 7.071l-4.999 4.998c-.975.976-2.255 1.464-3.535 1.464-1.28 0-2.56-.488-3.535-1.464-.494-.495-.863-1.067-1.107-1.678l.788-.785z"/></svg>
        </a>`;
		controlsContainer.appendChild(linkCell);
		const removeCell = document.createElement('span');
		removeCell.title = 'Unapply Font';
		removeCell.classList.add('removeCell');
		removeCell.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill-rule="evenodd" clip-rule="evenodd"><path d="M12 0c6.623 0 12 5.377 12 12s-5.377 12-12 12-12-5.377-12-12 5.377-12 12-12zm0 1c6.071 0 11 4.929 11 11s-4.929 11-11 11-11-4.929-11-11 4.929-11 11-11zm0 10.293l5.293-5.293.707.707-5.293 5.293 5.293 5.293-.707.707-5.293-5.293-5.293 5.293-.707-.707 5.293-5.293-5.293-5.293.707-.707 5.293 5.293z" /></svg>`;
		removeCell.addEventListener('click', function (e)
		{
			e.stopPropagation();
			chrome.tabs.query({ active: true, currentWindow: true }, (tabs) =>
			{
				const activeTab = tabs[0];
				if ( selectedCSS[sel] )
				{
					removeInjectedFontStyle(sel, () =>
					{
						delete selectedFonts[sel];
						delete selectedCSS[sel];
						updateSelectedList();
						chrome.storage.local.set({ ['selectedFonts_' + currentDomain]: selectedFonts });
					});
				}
				else
				{
					delete selectedFonts[sel];
					updateSelectedList();
					chrome.storage.local.set({ ['selectedFonts_' + currentDomain]: selectedFonts });
				}
			});
			updatePersistentState();
		});
		controlsContainer.appendChild(removeCell);
		topRow.appendChild(controlsContainer);
		const bottomRow = document.createElement('div');
		bottomRow.classList.add('selectedFontRowBottom');
		const fontNameSpan = document.createElement('span');
		fontNameSpan.classList.add('fontNameCell');
		fontNameSpan.textContent = fontFamily;
		fontNameSpan.style.fontFamily = fontFamily;
		fontNameSpan.style.fontWeight = fontWeight;
		bottomRow.appendChild(fontNameSpan);
		container.appendChild(topRow);
		container.appendChild(bottomRow);
		selectedContainer.appendChild(container);
		updateBadgeCounts();
	}
}

function appendTargetPage(fontName, fontUrl, fontWeight, fontStyle, fontSize = '', fontSizeUnit = 'px')
{
	let selector = document.getElementById('selectorInput').value;
	if ( ! selector )
	{
		selector = '*';
	}
	fetch(fontUrl)
		.then(response => response.text())
		.then(fontCss =>
		{
			chrome.tabs.query({ active: true, currentWindow: true }, tabs =>
			{
				const activeTab = tabs[0];
				const wrappedSelector = wrapSelector(selector);
				const customCss = buildCustomCss(wrappedSelector, fontName, fontWeight, fontStyle, fontSize, fontSizeUnit);
				const fullCss = fontCss + customCss;
				const styleId = getStyleId(selector);
				chrome.scripting.executeScript(
				{
					target:
					{
						tabId: activeTab.id
					},
					func: (css, id) =>
					{
						let style = document.getElementById(id);
						if ( ! style )
						{
							style = document.createElement('style');
							style.id = id;
							document.head.appendChild(style);
						}
						style.textContent = css;
						document.documentElement.classList.add('previewerForGoogleFonts');
					},
					args: [fullCss, styleId]
				});
				selectedCSS[selector] = styleId;
			});
		})
		.catch(error => console.error(error));
}

function loadVariantStyles(element)
{
	if ( ! element )
	{
		return;
	}
	const variantsDiv = element.querySelector('div.variants');
	if ( ! variantsDiv || variantsDiv.classList.contains('loaded') )
	{
		return;
	}
	if ( ! variantsDiv.querySelector('li') && variantsDiv.getAttribute('data-variants') )
	{
		try
		{
			const variantsArray = JSON.parse(variantsDiv.getAttribute('data-variants'));
			let html = '<ul>';
			variantsArray.forEach(variant =>
			{
				const fontName = element.getAttribute('data-font-name');
				html += `
            <li
              data-font-name="${fontName}"
              data-font-weight="${variant.fontWeight}"
              data-font-style="${variant.fontStyle}"
              class="selectable variant icon"
              style="font-weight:${variant.fontWeight}; font-style:${variant.fontStyle};"
            >
              <span class="fontName" style="font-family:'${fontName}'">${fontName}</span>
              <span class="fontStyles">${variant.namedWeight} ${variant.fontWeight} ${variant.fontStyle === 'italic' ? 'Italic' : ''}</span>
            </li>`;
			});
			html += '</ul>';
			variantsDiv.innerHTML = html;
		}
		catch (e)
		{
			console.error('Error parsing variant data', e);
		}
	}
	const fontName = element.querySelector('span.familyName')?.textContent;
	if (fontName)
	{
		const fontUrlStart = 'https://fonts.googleapis.com/css2?family=';
		let fontUrl = fontUrlStart + encodeURIComponent(fontName) + ':ital,wght@';
		const pairs = [ ];
		element.querySelectorAll('div.variants li').forEach(li =>
		{
			const italic = li.getAttribute('data-font-style') === 'italic' ? 1 : 0;
			const weight = li.getAttribute('data-font-weight');
			pairs.push(italic + weight + '|' + italic + ',' + weight);
		});
		pairs.sort();
		let first = true;
		pairs.forEach(pair =>
		{
			const tuple = pair.split('|')[1];
			if ( ! first )
			{
				fontUrl += ';';
			}
			fontUrl += tuple;
			first = false;
		});
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.type = 'text/css';
		link.href = fontUrl;
		document.head.appendChild(link);
		variantsDiv.classList.add('loaded');
	}
}