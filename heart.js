class Heart extends HTMLElement
{
	constructor()
	{
		super();
		this.innerHTML = `
        <div class="icon-heart" data-font-name="${this.getAttribute('data-font-name') || ''}" title="Favorites">
          <svg class="heart unfilled" width="20" height="20" viewBox="0 0 24 24">
            <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402m5.726-20.583c-2.203 0-4.446 1.042-5.726 3.238-1.285-2.206-3.522-3.248-5.719-3.248-3.183 0-6.281 2.187-6.281 6.191 0 4.661 5.571 9.429 12 15.809 6.43-6.38 12-11.148 12-15.809 0-4.011-3.095-6.181-6.274-6.181"/>
          </svg>          
          <svg class="heart filled" width="20" height="20" viewBox="0 0 24 24">
            <path d="M 6.28125,1.9992187 C 4.0193461,1.9624295 1.6750342,3.4418436 1.171875,5.7304687 0.54964202,8.0153755 1.6764534,10.283588 2.9976562,12.091406 5.6040962,15.60959 8.9188062,18.508006 12,21.592969 15.126822,18.446884 18.515037,15.506536 21.140625,11.90625 22.424119,10.128909 23.444094,7.881274 22.809375,5.6625 22.302439,3.4886766 20.130536,2.0503875 17.964844,2.015625 15.575692,1.8740863 13.389821,3.486968 12.39375,5.5898437 12.152087,6.0429493 11.98298,6.8365546 11.770312,5.9226562 10.826218,3.7285173 8.7655942,1.9629425 6.28125,1.9992187 Z M 17.726,1.01 C 15.523,1.01 13.28,2.052 12,4.248 10.715,2.042 8.478,1 6.281,1 3.098,1 0,3.187 0,7.191 0,11.852 5.571,16.62 12,23 18.43,16.62 24,11.852 24,7.191 24,3.18 20.905,1.01 17.726,1.01" />
          </svg>
        </div>
      `;
	}
	connectedCallback()
	{
		const fontName = this.getAttribute('data-font-name') || '';
		chrome.storage.local.get('favorite-fonts', result =>
		{
			const favorites = result['favorite-fonts'] || [ ];
			const isFavorited = favorites.includes(fontName);
			this.setFavorited(isFavorited);
		});
		this.addEventListener('click', this.toggleFavorite.bind(this));
	}
	disconnectedCallback()
	{
		this.removeEventListener('click', this.toggleFavorite.bind(this));
	}
	toggleFavorite(event)
	{
		event.stopPropagation();
		const currentlyFavorited = (this.getAttribute('data-favorited') === 'true');
		const newState = ! currentlyFavorited;
		const fontName = this.getAttribute('data-font-name') || '';
		chrome.storage.local.get('favorite-fonts', result =>
		{
			let favorites = result['favorite-fonts'] || [ ];
			if ( newState )
			{
				if ( ! favorites.includes(fontName) )
				{
					favorites.push(fontName);
				}
			}
			else
			{
				favorites = favorites.filter(f => f !== fontName);
			}
			chrome.storage.local.set({ 'favorite-fonts': favorites }, () =>
			{
				this.setFavorited(newState);
				this.dispatchEvent(new CustomEvent('favorite-toggle',
				{
					bubbles: true,
					detail:
					{
						favorited: newState,
						fontName: fontName
					}
				}));
			});
		});
	}
	setFavorited(isFavorited)
	{
		this.setAttribute('data-favorited', String(isFavorited));
		const filled = this.querySelector('svg.filled');
		const unfilled = this.querySelector('svg.unfilled');
		if ( isFavorited )
		{
			if ( filled )
			{
				filled.style.display = 'inline-block';
			}
			if ( unfilled )
			{
				unfilled.style.display = 'none';
			}
		}
		else
		{
			if ( filled )
			{
				filled.style.display = 'none';
			}
			if ( unfilled )
			{
				unfilled.style.display = 'inline-block';
			}
		}
	}
}

customElements.define('favorite-heart', Heart);