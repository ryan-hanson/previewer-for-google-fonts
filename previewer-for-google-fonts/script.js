var useCache;
$(document).ready(function()
{
    // Check whether local cache is enabled in the settings, if not, enable them by default
    key = 'settings-use-cache';
    chrome.storage.local.get(key, function(result)
    {
        useCache = result[key];

        // If the setting hasn't been created yet, set it to true by default
        if ( useCache == undefined )
        {
            useCache = true;
            setStorageData(key, useCache);        
        }
        
        // If the cache is enabled, retrieve JSON from the cache, otherwise retrieve it from the Google API
        var data;
        if ( useCache )
        {    
            $('input[name="useCache"]').prop('checked', true);
            
            key = 'font-data';
            chrome.storage.local.get(key, function(result)
            {
                // If the Google Fonts JSON exists in the cache, retrieve it, else make a request to the Google API the first time and cache it
                data = result[key];
                if ( data == undefined )
                {
                    console.log('Cache Enabled - Load fonts data from Google first');
                    RequestFontsJSON(true);
                }
                else
                {
                    loadPage(data);
                    console.log('Cache Enabled - Load font data from cache');                
                }
                
            });
        }
        else
        {
            console.log('Cache Disabled - Always load font data from Google');
            $('input[name="useCache"]').prop('checked', false);
            RequestFontsJSON(false);            
        }      
    });   

	// Load fonts while scrolling
    var timer;
	$('div.scroller').on('scroll', function()
	{
        // Ensure the handler doesn't fire repetitively while scrolling
        if ( timer ) clearTimeout(timer);
        timer = setTimeout(function()
        {
            checkVisibility();
        }, 500);		
	});

	// Font search
    $('input[name="search"]').keyup(function()
    {   
        // Clear previous search results
    	$('ul.search-results').html('');

        // Ensure case insensitivity
        var searchValue = $(this).val().toLowerCase();

        // Don't search until at least 3 characters have been entered
        if ( searchValue.length > 2 )
        {
            // Hides the full list of fonts in order to just display the search results (for performance)
        	$('ul.full-list').hide();
        	$('ul.full-list > li').each(function()
        	{           
                // Ensure case insensitivity 		
            	var fontName = $(this).attr('data-lowercase');

                // Perform the search on the individual font
            	if ( fontName.includes(searchValue) )
            	{
                    // Ensures the font family gets loaded to the page after the search
                    $(this).addClass('visible');

            		// Clone the font list item and add it to the search results (for perforance)
                	$(this).clone().appendTo('ul.search-results');             
            	}
        	});
        	checkVisibility();
        }
        else
        {
            // Show the full list wh not searching
			$('ul.full-list').show();
        }
    });

    // Change category filter
    $(document).on('change', 'div.category-filter select', function()
    {
        var selectedValue = $(this).val();
        if ( selectedValue == 'none' )
        {
            //  Remove the filter
            $('div.filterable li.categoryHidden').removeClass('categoryHidden');
        }
        else
        {
            $('div.filterable li.parent[data-category = "'+selectedValue+'"]').removeClass('categoryHidden');
            $('div.filterable li.parent[data-category != "'+selectedValue+'"]').addClass('categoryHidden');
        }
        checkVisibility();
    });

    // Change weight filter
    $(document).on('change', 'div.weight-filter select', function()
    {
        var selectedValue = $(this).val();
        if ( selectedValue == 'none' )
        {
            // Revert the style of opened families while not filtered by weight
            $('div.filterable').removeClass('weightFiltered');

            // Remove the filter
            $('div.filterable li.weightHidden').removeClass('weightHidden');

            // Close all variants
            $('div.filterable li.parent').removeClass('open');
        }
        else
        {
            // Find families that contain the selected weight and open their variants
            $('div.filterable li.parent[data-variant-weights*="'+selectedValue+'"]').addClass('open').removeClass('weightHidden');;

            // Find families that do not contain the selected weight and close/hide them
            $('div.filterable li.parent').not('[data-variant-weights*="'+selectedValue+'"]').removeClass('open').addClass('weightHidden');      

            // Find families that contain the selected weight and show the variants with the selected weight 
            $('div.filterable li.parent[data-variant-weights*="'+selectedValue+'"]').find('li[data-font-weight="'+selectedValue+'"]').removeClass('weightHidden');
            
            // Find variants within the open families that aren't the selected weight and hide them
            $('div.filterable li.parent.open li').not('li[data-font-weight="'+selectedValue+'"]').addClass('weightHidden');

            // Change the style of opened families while filtered by weight
            $('div.filterable').addClass('weightFiltered');
        }
        checkVisibility();
    });
    
    // Add/Remove font from favorites list
    $(document).on('click', 'ul.fonts li div.icon-heart', function(e)
    {
        // If heart is clicked, don't trigger click on the list item
        e.stopPropagation();  
        
        var fontName = $(this).closest('li').attr('data-font-name');
        if ( $(this).hasClass('selected') )
        {
            $(this).removeClass('selected');            
            $('li[data-font-name="'+fontName+'"] div.icon-heart').removeClass('selected');
            $('ul.favorites li[data-font-name="'+fontName+'"]').remove();      
        }
        else
        {
            $(this).addClass('selected');
            $(this).closest('li').clone().appendTo('ul.favorites');
            $('ul.favorites li').removeClass('open');          
        }

        // Store the updated favorites list into the cache
        updateFavoritesList();
    });    

    // Open font variants or select a font
    $(document).on('click', 'li', function(e)
    {    
        // If child list item is clicked, don't trigger click on the parent
        e.stopPropagation();

        // Variants or parents without variants are marked as selectable
        if ( $(this).hasClass('selectable') )
        {     
            // If a variant is clicked or the fonts are NOT being filtered by weight
            if ( $(this).hasClass('variant') || !$(this).closest('div.scroller').hasClass('weightFiltered') )
            {      
                // Deselect
                if ( $(this).hasClass('selected') )
                {
                    $(this).removeClass('selected');
                }
                // Select
                else
                {
                    // Deselect all other fonts
                    $('li.selected').removeClass('selected');

                    // Select the click font
                    $(this).addClass('selected');

                    // Build URL to the Google Font and append it to the active tab
                    var fontUrlStart = 'https://fonts.googleapis.com/css2?family=';
                    var fontName = $(this).attr('data-font-name');
                    var fontUrl = fontUrlStart+encodeURIComponent(fontName)+':ital,wght@';
                    var fontWeight = $(this).attr('data-font-weight');                
                    var fontStyle = $(this).attr('data-font-style');                
                    var italic = fontStyle == 'italic' ? 1 : 0;
                    pair = italic+','+fontWeight;
                    fontUrl += pair;        
                    appendTargetPage(fontName, fontUrl, fontWeight, fontStyle);              
                }
            }
        }
        // If a parent with variants is clicked and fonts are NOT being filtered by weight
        else if ( !$(this).closest('div.scroller').hasClass('weightFiltered') )
        {        
            // Close the family
            if ( $(this).hasClass('open') )
            {
                $(this).removeClass('open');
            }
            // Open the family
            else
            {                                
                $(this).addClass('open');
                
                // Load the Google Fonts for the variants
                if ( !$(this).find('div.variants').hasClass('loaded') )
                {
                    loadVariantStyles($(this).attr('data-font-index'));
                }
            }
        }
    });

    // Toggle navigation tabs
    $(document).on('click', 'div.tabs > div', function()
    {
        $('div.tabs > div').removeClass('active');
        $(this).addClass('active');
        $('div.column.right > div').removeClass('active');
        $('div.column.right > div').eq($(this).index()).addClass('active');
    });

    // Change selector - ensure both selector inputs have the same value
    $('input[name="selector"]').change(function()
    {
        $('input[name="selector"]').val($(this).val());
    });     

    // Change Settings - Enable/Disable local cache
    $(document).on('click', 'input[name="useCache"]', function(e)
    {
        var checked = $(this).prop('checked');
        var proceed = false;
        if ( checked )
        {
            proceed = true;
        }
        else
        {
            var c = confirm('Switching off the cache will also remove the fonts from storage. Continue?');
            if ( c )
            {
                proceed = true;
                clearCachedFonts();          
            }
        }
        if ( proceed )
        {
            var key = 'settings-use-cache';                
            setStorageData(key, checked);
        }
        else
        {
            e.preventDefault();            
        }
    });    

    // Clear cached fonts from storage (keeps settings)
    $(document).on('click', '.clearFonts', function()
    {
        var c = confirm('Clear all fonts from local cache?');
        if ( c )
        {
            clearCachedFonts();
            var message = $(this).closest('div.field').find('p.success');
            $(message).fadeIn('slow', function()
            {
                $(message).delay(2000).fadeOut('slow');
            });                        
        }
    });

    // Clear all local storage
    $(document).on('click', '.clearAll', function()
    {
        var c = confirm('Clear everything from the extension cache?');
        if ( c )
        {
            var message = $(this).closest('div.field').find('p.success');
            chrome.storage.local.clear(function()
            {                
                $(message).fadeIn('slow', function()
                {
                    $(message).delay(2000).fadeOut('slow');
                });                  
            });             
        }
    });    
});

/*
- Make request to Google Fonts API to retrieve the JSON data
- [useCache] - determines if the response will be stored in the cache
*/
function RequestFontsJSON(useCache)
{
    $.ajax
    ({
        type:'GET',
        url:'https://www.googleapis.com/webfonts/v1/webfonts?key=<API KEY>',
        success: function(data)
        {
            console.log('Loaded fonts from Google');
            if ( useCache )
            {
                var key = 'cache-font-data';
                setStorageData(key, data);
            }
            loadPage(data);
        },
        async: false
    });
} 

/* 
    - Load page after Google Fonts are loaded from the cache or via the api
    - Build font list and split them into multiple stylesheets containing 50 fonts each 
*/
function loadPage(data)
{    
    // Initialize required variables
    var fontUrlSymbol, fontHtml, numStyles, variantHtml, fontWeight, fontStyle, fontStyleNoNormal, actionClass, 
        variantWeightList, variantWeightString;
    var fonts = data.items;
    var fontUrlStart = 'https://fonts.googleapis.com/css2';
    var fontUrlList = '';
    var categoryList = [];
    var j = 1;
    var k = 1;

    // Used to display the weight name in the font list and filter dropdown
    var fontStyleNames = 
    {
        '100' : 'Thin',
        '200' : 'Extra-Light',
        '300' : 'Light',
        '400' : 'Regular',
        '500' : 'Medium',
        '600' : 'Semi-Bold',
        '700' : 'Bold',
        '800' : 'Extra-Bold',
        '900' : 'Black'   
    };     

    var numOfSets = Math.ceil(parseInt(data.items.length / 50));

    // Loop each font
    for ( i = 0; i <= data.items.length - 1; i++ )
    {    
        // Only include families that contain the latin subset  
        subsets = data.items[i].subsets;
        if ( subsets.includes('latin')  )
        {   
            // Build HTML for list of variants
            variantWeightList = [];        
            variantHtml = '<ul>';
            for ( v = 0; v <= data.items[i].variants.length - 1; v++ )
            {
                fontStyle = data.items[i].variants[v].includes('italic') ? 'italic' : 'normal';
                fontStyleNoNormal = fontStyle != 'normal' ? 'Italic' : '';
                fontWeight = data.items[i].variants[v].replace(/\D/g,'').includes('00') ? data.items[i].variants[v].replace(/\D/g,'') : '400';
                if ( !variantWeightList.includes(fontWeight) )
                {
                    variantWeightList.push(fontWeight);
                }
                variantHtml += 
                `
                <li 
                    data-font-name="${data.items[i].family}" 
                    data-font-weight="${fontWeight}" 
                    data-font-style="${fontStyle}"                 
                    class="selectable variant icon" 
                    style="font-weight:${fontWeight};font-style:${fontStyle};"
                >
                    <span class="fontName" style="font-family:'${data.items[i].family}'">${data.items[i].family}</span>
                    <span class="fontStyles">${fontStyleNames[fontWeight]} ${fontWeight} ${fontStyleNoNormal}</span>              
                </li>        
                `;
            }
            variantWeightString = variantWeightList.join();
            variantHtml += '</ul>';

            // Build parent family HTML
            numStyles = data.items[i].variants.length == 1 ? 'style' : 'styles';
            actionClass = data.items[i].variants.length == 1 ? 'selectable' : 'hasVariants';
            fontHtml = 
            `
                <li 
                    data-font-name="${data.items[i].family}"
                    data-font-weight="400" 
                    data-variant-weights="${variantWeightString}"            
                    data-font-index="${i}" 
                    data-category="${data.items[i].category}" 
                    data-lowercase="${data.items[i].family.toLowerCase()}" 
                    class="${actionClass} icon parent" 
                    style="font-family:'${data.items[i].family}'"
                >    
                    <div class="icon-heart">
                        <svg class="heart unfilled" width="20" height="20" viewBox="0 0 24 24" fill-rule="evenodd" clip-rule="evenodd"><path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402m5.726-20.583c-2.203 0-4.446 1.042-5.726 3.238-1.285-2.206-3.522-3.248-5.719-3.248-3.183 0-6.281 2.187-6.281 6.191 0 4.661 5.571 9.429 12 15.809 6.43-6.38 12-11.148 12-15.809 0-4.011-3.095-6.181-6.274-6.181"/></svg>
                        <svg class="heart filled" width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 4.248c-3.148-5.402-12-3.825-12 2.944 0 4.661 5.571 9.427 12 15.808 6.43-6.381 12-11.147 12-15.808 0-6.792-8.875-8.306-12-2.944z"/></svg>
                    </div>      
                    <span class="fontName familyName">${data.items[i].family}</span>
                    <span class="fontStyles">${data.items[i].variants.length} ${numStyles}</span>
                    <div class="variants">
                        ${variantHtml}
                    </div>                               
                </li>        
            `;
            $('ul.full-list').append(fontHtml);
        
            // Build category filter list
            if ( !categoryList.includes(data.items[i].category) )
            {
                categoryList[data.items[i].category] = data.items[i].category;
            }    

            // Build URL for a list of fonts in increments of 50
            fontUrlSymbol = j == 1 ? '?' : '&';
            fontUrlList += fontUrlSymbol+'family='+encodeURIComponent(data.items[i].family);
            if ( j == 50 )
            {
                fontUrl = fontUrlStart+fontUrlList;
                createFontStyles(fontUrl, k);
                fontUrlList = '';
                j = 0;
                k++;
            }
            j++;
        }
    }
    // Run one last time to get the final stylesheet
    if ( j > 0 )
    {
        fontUrl = fontUrlStart+fontUrlList;
        createFontStyles(fontUrl, k);
    }

    // Populate the filter dropdowns
    createFilterOptions(fontStyleNames, 'weight', 'weights');     
    createFilterOptions(categoryList.sort(), 'category', 'categories');

    checkVisibility();
    loadFavoritesList();
}

/*
- Checks viewport visibility of each font and activates the font families as needed
*/
function checkVisibility()
{
    $('ul.fonts li:not(.visible)').each(function()
    {
        if ( $(this).isVisible() )
        {
            $(this).addClass('visible');
        }
    });

    var increment = 50;				
    $('ul.fonts li.visible:not(.loaded)').each(function()
    {
        var index = $(this).index();
        var fontSet = parseInt(Math.floor(index/increment)) + 1;
        activateFontStyles(fontSet);				
    });
}

/*
- Stores the URL of each stylesheet in a link tag but defers loading by leaving the href tag blank
*/
function createFontStyles(fontUrl, index)
{
    $('head').append('<link rel="stylesheet" type="text/css" data-index="'+index+'" data-url="'+fontUrl+'" href="" />');
}

/*
- Activates the styles (increments of 50) 
- Determines whether the font styles should be stored in the local cache or not
- Determines whether to retrieve the styles from the cache or from Google
*/
function activateFontStyles(index)
{
    var stylesheet = $('link[data-index="'+index+'"]');
    // Check if this set of styles has been activated already
    if ( $(stylesheet).length )
    {
        if ( $(stylesheet).attr('href') == '' )
        {
            var fontUrl = $(stylesheet).attr('data-url');
            if ( useCache )
            {
                var key = 'cache-font-files-'+index;                
                chrome.storage.local.get(key, function(result)
                {
                    var fontStyles = result[key];
                    if ( fontStyles == undefined )
                    {
                        console.log('Load fonts from Google');
                        extractUrlsFromPage(fontUrl, index);         
                    }
                    else
                    {
                        console.log('Load fonts from cache');
                        if ( !$('#fontStyles'+index).length )
                        {
                            var html = '<style id="fontStyles'+index+'"></style>';
                        }
                        $('head').append(html);    
                        $('#fontStyles'+index).append(fontStyles);
                    }
                });
                $(stylesheet).remove();
            }
            else
            {                    
                $('link[data-index="'+index+'"]').attr('data-url','');
                $('link[data-index="'+index+'"]').attr('href', fontUrl);     
            }

            // Mark the individual families as loaded
            var increment = 50;
            var rangeEnd = index * increment;
            var rangeStart = rangeEnd - increment;

            for ( i = rangeStart; i <= rangeEnd; i++ )
            {
                $('ul.fonts li').eq(i).addClass('loaded');
            }
        }
    }
}

// Only works if Google continues to add a comment with the subset between each font family
function extractUrlsFromPage(fontsUrl, index)
{	
    console.log(fontsUrl);    
    $.ajax
    ({
		type:'GET',
		url: fontsUrl,
		success: function(data)
		{    
            var familyMatch1, familyMatch2, familyMatcher, family;        
            var url;
            var urlList = [];
            var familyList = [];
            var urlRegex = /(https?:\/\/[^ ]*)/;
            hasUrl = true;
            contentArray = data.split('/*');
            for ( i = 0; i <= contentArray.length - 1; i++ )
            {
                if ( contentArray[i].includes('latin') )
                {
                    content = contentArray[i];
                    if ( content.match(urlRegex) == null )
                    {
                        hasUrl = false;
                    }
                    else
                    {
                        url = content.match(urlRegex)[1].replace(')','');
                        if ( url == null )
                        {
                            hasUrl = false;
                        }
                        else
                        {
                            content = content.replace(url,'');
                            urlList.push(url);
                        } 
                                                    
                        familyMatch1 = 'font-family:';
                        familyMatch2 = ';';
                        familyMatcher = content.match(new RegExp(familyMatch1 + "(.*)" + familyMatch2));                            
                        content = content.replace(familyMatcher[0], '');
                        family = familyMatcher[1].replaceAll("'","").replace(' ','');
                        familyList.push(family);                 
                    }
                }
            }
            convertFontFiles(urlList, familyList, index);		
		}
	});
}

/*
- Encodes each font family as base64 data and stores it in the cache
*/
function convertFontFiles(urlList, familyList, index, increment, css)
{  
    if ( css == undefined )
    {
        css = '';
    }
    if ( increment == undefined )
    {
        increment = 0;
    } 

    if ( !$('#fontStyles'+index).length )
    {
        var html = '<style id="fontStyles'+index+'"></style>';
    }
    $('head').append(html);
    if ( urlList[increment] != undefined && familyList[increment] != undefined )
    {
        $.ajax
        ({
            xhrFields:
            {
                responseType: 'blob' 
            },        
            type:'GET',
            url:urlList[increment],
            success: function(result)
            {
                var reader = new FileReader();
                reader.readAsDataURL(result);
                reader.onload =  function(e)
                {
                    css += 
                    `
                    @font-face
                    {
                        font-family:'${familyList[increment]}';
                        font-style: normal;
                        font-weight: 400;
                        src: url(${e.target.result}) format('woff2');
                        unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
                    }
                    `;                                
                    if ( increment == urlList.length - 1 )
                    {
                        $('#fontStyles'+index).append(css);
                        var key = 'cache-font-files-'+index;
                        setStorageData(key, css);
                    }
                    else
                    {
                        convertFontFiles(urlList, familyList, index, increment+1, css);
                    }
                };   
            }
        }); 
    }    
}

// Build category select menu
function createFilterOptions(options, name, namePlural)
{
    html = '<option value="none">All '+toTitleCase(namePlural)+'</option>';
    for ( var key in options )
    {
        if ( key != undefined )
        {
            html += '<option value="'+key+'">'+toTitleCase(options[key])+'</option>';
        }
    }
    $('div.'+name+'-filter select').html(html);
}

// Heart the favorite fonts and populate the favorites list
function loadFavoritesList()
{
    var key = 'favorite-fonts';
    chrome.storage.local.get(key, function(result)
    {
        var favorites = result[key];
        var favorite;
        if ( favorites != undefined )
        {    
            for ( key in favorites )
            {
                favorite = favorites[key];
                $('li[data-font-name="'+favorite+'"] div.icon-heart').addClass('selected');
                $('li.parent[data-font-name="'+favorite+'"]').clone().appendTo('ul.favorites');                
            }            
        }   
    });    
}

// Create an array of favorited fonts and store it into the cache
function updateFavoritesList()
{
    var key = 'favorite-fonts';
    var favorites = [];
    var family;
    $('ul.full-list li div.icon-heart.selected').each(function()
    {
        family = $(this).closest('li').find('span.fontName').html();
        favorites.push(family);
    });
    setStorageData(key, favorites); 
}

// Loads variant styles from Google only when the family containing them is clicked and opened up
function loadVariantStyles(index)
{
    var element = $('ul.full-list li[data-font-index="'+index+'"]');
    var italic, weight, pair;
    var fontUrlStart = 'https://fonts.googleapis.com/css2?family=';
    var fontName = $(element).find('span.familyName').text();
    var fontUrl = fontUrlStart+encodeURIComponent(fontName)+':ital,wght@';
    var pairs = [];
    $(element).find('div.variants li').each(function()
    {        
        italic = $(this).attr('data-font-style') == 'italic' ? 1 : 0;
        weight = $(this).attr('data-font-weight');
        pair = italic+weight+'|'+italic+','+weight;
        pairs.push(pair);
    });
    pairs.sort();

    var tuples;
    var first = true;
    for ( i = 0; i <= pairs.length - 1; i++ )
    {
        if ( !first )
        {
            fontUrl += ';';     
        }
        tuples = pairs[i].split('|');
        fontUrl += tuples[1];
        first = false;
    }
    $('head').append('<link rel="stylesheet" type="text/css" href="'+fontUrl+'" />');
    $(element).find('div.variants').addClass('loaded');
}

// Sends the selected font family CSS to the active tab and applies font-family styles
function appendTargetPage(fontName, fontUrl, fontWeight, fontStyle)
{
    var selector = $('input[name="selector"]').val();
    if ( selector == undefined || selector == null || selector == '' )
    {
        selector = '*';
    }
    $.ajax
    ({
        type:'GET',
        url:fontUrl,
        success: function(fontCss)
        {
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs)
            {
                var activeTab = tabs[0];
                var customCss = selector+'{font-family:"'+fontName+'" !important;font-weight:'+fontWeight+';font-style:'+fontStyle+'}';
                var fullCss = fontCss + customCss;                
                chrome.scripting.insertCSS
                ({
                    target: { tabId: activeTab.id },
                    css: fullCss
                });        
            });            
        }
    });
}

// Used to titlecase the filter select menus
function toTitleCase(str)
{
    return str.replace
    (
        /\w\S*/g,
        function(txt)
        {
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        }
    );
}

function setStorageData(key, value)
{
    chrome.storage.local.set({[key]: value});
}

function clearCachedFonts()
{
    var numOfSets = Math.ceil( $('ul.full-list li.parent').length / 50 );
    var keys = [];
    for ( i = 0; i <= numOfSets; i++ )
    {
        keys.push('cache-font-files-'+i);                    
    }
    keys.push('cache-font-data');         
    chrome.storage.local.remove(keys); 
}

// Determines if a certain element is visible within the viewport
$.fn.isVisible = function()
{
    if ( $(this).is(':visible') )
    {
        /* Add 600 to bottom of viewport to help load fonts right before scrolling to them */
        var viewport = 
        {
            top : $(window).scrollTop(),
            left : $(window).scrollLeft(),
            right : $(window).scrollLeft() + window.innerWidth,
            bottom : $(window).scrollTop() + window.innerHeight + 600 
        };
        
        var bounds = this.offset();
        bounds.right = bounds.left + this.outerWidth();
        bounds.bottom = bounds.top + this.outerHeight();

        return ( !( viewport.right < bounds.left || viewport.left > bounds.right || viewport.bottom < bounds.top || viewport.top > bounds.bottom ) );
    }
};
