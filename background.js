function getStyleId(selector)
{
	return 'previewer-font-' + selector.replace(/[^a-z0-9]/gi, '_');
}

function wrapSelector(selector)
{
	selector = selector.trim();
	if ( selector.toLowerCase() === 'html' )
	{
		return 'html.previewerForGoogleFonts';
	}
	return 'html.previewerForGoogleFonts ' + selector;
}

function buildCustomCss(selector, fontFamily, fontWeight, fontStyle, fontSize, fontSizeUnit)
{
	let css = `${selector}{font-family:'${fontFamily}' !important; font-weight:${fontWeight} !important;`;
	if ( fontStyle && fontStyle.trim() !== '' && fontStyle !== 'null' )
	{
		css += ` font-style:${fontStyle} !important;`;
	}
	if ( fontSize && fontSize.trim() !== '' )
	{
		css += ` font-size:${fontSize}${fontSizeUnit} !important;`;
	}
	css += '}';
	return css;
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) =>
{
	if ( changeInfo.status === 'complete' && tab.url )
	{
		let urlObj;
		try
		{
			urlObj = new URL(tab.url);
		}
		catch (e)
		{
			return;
		}
		const domain = urlObj.host;
		chrome.storage.local.get(
		[
			'keepApplied_' + domain,
			'selectedFonts_' + domain
		],
		(result) =>
		{
			const keepApplied = result['keepApplied_' + domain];
			const storedFonts = result['selectedFonts_' + domain] || { };
			if ( keepApplied )
			{
				for (const selector in storedFonts)
				{
					if ( storedFonts.hasOwnProperty(selector) )
					{
						const { fontFamily, fontWeight, fontStyle, fontSize, fontSizeUnit } = storedFonts[selector];
						const fontUrlStart = 'https://fonts.googleapis.com/css2?family=';
						const italic = fontStyle === 'italic' ? 1 : 0;
						const fontUrl =
							fontUrlStart +
							encodeURIComponent(fontFamily) +
							':ital,wght@' +
							italic +
							',' +
							fontWeight;
						fetch(fontUrl)
						.then(response => response.text())
						.then(fontCss =>
                        {
                            const wrappedSelector = wrapSelector(selector);
                            const customCss = buildCustomCss(wrappedSelector, fontFamily, fontWeight, fontStyle, fontSize, fontSizeUnit);
                            const fullCss = fontCss + customCss;
                            const styleId = getStyleId(selector);
                            chrome.scripting.executeScript(
                            {
                                target:
                                {
                                    tabId: tabId
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
                        })
                        .catch(error => console.error(error));
					}
				}
			}
		});
	}
});