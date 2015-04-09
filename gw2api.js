(function(window, $) {
	var DEFAULT_PAGE_SIZE = 10;
	var STUFF_EXPIRES = 1000 * 60 * 60 * 24 * 7; /* one week */
	
	var API_ITEMS = 'https://api.guildwars2.com/v1/items.json';
	var API_ITEM_DETAILS = 'https://api.guildwars2.com/v1/item_details.json';	
	
	// attempts to look up an item in local storage, returns null if not found
	var checkStorage = supports_html5_storage() ? function(key, lang) {
		if (!!lang === false) {
			lang = 'en';
		}
		var value = window.localStorage.getItem(key + '_' + lang);
		if (value) {
			var obj = JSON.parse(value);
			if (obj.stuffed_at) {
				if ((new Date() - obj.stuffed_at) > STUFF_EXPIRES) {
					console.log('Expiring ' + key);
					window.localStorage.removeItem(key + '_' + lang);
					return null;
				}
			}
			return obj;
		}
		return null;
	} : function(key, lang) { return null; };
	
	// creates a GW2 chat link tag for a specific item
	var createChatTag = supports_base64() ? function(item_id) {
		var bytes = [];
		bytes.push(0x02);
		bytes.push(0x01);
		bytes.push((item_id)       & 0xff);
		bytes.push((item_id >> 8)  & 0xff);
		bytes.push((item_id >> 16) & 0xff);
		bytes.push((item_id >> 24) & 0xff);
		return '[&' + window.btoa(String.fromCharCode.apply(null, bytes)) + ']';
	} : function(item_id) { return ''; }
	
	// retrieves the list of GW2 item IDs
	function fetchItemIDs(callback) {
		var item_ids = checkStorage('fetchItemIDs');
		
		if (item_ids) {
			console.log('fetchItemIDs: fetched from local storage');
			window.setTimeout(function() { callback(item_ids); }, 0);	
		} else {
			$.ajax(API_ITEMS, {
				dataType: 'json',
				success: function(data) {
					console.log('fetchItemIDs: fetched from remote URL');
					stuffStorage('fetchItemIDs', data);
					callback(data);
				}
			});
		}
	};
	
	// retrieves the data for a specific item from GW2 API
	function fetchItem(id, callback) {
		var item = checkStorage('fetchItem_' + id, 'en');
		
		if (item) {
			console.log('fetchItem ' + id + ': fetched from local storage');
			window.setTimeout(function() { callback(item); }, 0);
		} else {
			$.ajax(API_ITEM_DETAILS, {
				dataType: 'json',
				data: { item_id: id, lang: 'en' },
				success: function(data) {
					console.log('fetchItem ' + id + ': fetched from remote URL');
					stuffStorage('fetchItem_' + id, data, 'en');
					callback(data);
				}	
			});
		}
	};
	
	// converts an item flag into a CSS class name
	function flagToClass(flag, flagType) {
		return 'item-' + (flagType || 'flag') + '-' + flag.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
	};
	
	// converts infusion flags to a human-readable form
	function parseInfusionFlags(flags) {
		return 'Unused ' + flags.join('/') + ' Infusion Slot';
	};
	
	// converts selected item flags into human-readable form
	function parseItemFlags(flags) {
		var xflags = [];
		for (var i = 0; i < flags.length; i++) {
			if (flags[i] === 'AccountBound') {
				xflags.push('Account Bound');
			} else if (flags[i] === 'SoulBindOnUse' || flags[i] === 'SoulBindOnAcquire') {
				xflags.push('Soulbound');
			} else if (flags[i] === 'Unique') {
				xflags.push('Unique');
			}
		}
		return xflags.join('<br>');
	};
	
	// converts the raw value of an item into a user-friendly format: 0g 0s 0c
	function parseItemValue(value) {
		parseItemValue.cache = parseItemValue.cache || {};
		if (value) {
			if (parseItemValue.cache[value]) {
				return parseItemValue.cache[value];
			}
			
			var val = parseInt(value);
			if (val) {
				var copper = val % 10;
				var silver = (val % 100 - copper) / 10;
				var gold =  (val - silver * 10 - copper) / 100;
				
				var text = '';
				if (copper) {
					text = '<span class="item-value-copper">' + copper + '</span>';
				}
				if (silver) {
					text = '<span class="item-value-silver">' + silver + '</span> ' + text;
				}
				if (gold) {
					text = '<span class="item-value-gold">' + gold + '</span> ' + text;
				}
				parseItemValue.cache[value] = text;
				return text;
			}
		}	
		return '';
	};
	
	// creates a clone of the item detail template and stuffs it with the data from the specified GW2 item
	function renderItemDetail(id, detailsSelector, insertAtSelector) {
		if (id && detailsSelector) {
			$('[data-item-rendered]').remove();
			var details$ = $(detailsSelector).clone().hide();
			fetchItem(id, function(item) {
				details$.attr('id', 'item_' + item.item_id);
				for (var f = 0; f < item.flags.length; f++) {
					details$.addClass(flagToClass(item.flags[f]));
				}
				details$.addClass(flagToClass(item.type, 'type'))
				details$.find('.item-id').append(item.item_id);
				details$.find('.item-name').append(item.name);
				details$.find('.item-description').append(stripHtml(item.description));
				details$.find('.item-type').append(splitName(item.type));
				details$.find('.item-level').append(item.level);
				details$.find('.item-rarity').append(item.rarity);
				details$.addClass('item-rarity-' + item.rarity.toLowerCase());
				details$.find('.item-value').append(parseItemValue(item.vendor_value));
				details$.find('.item-game-types').append(item.game_types.join(', '));
				details$.find('.item-flags').append(parseItemFlags(item.flags));
				details$.find('.item-restrictions').append(item.restrictions.join(', '));
				details$.find('.item-crafting-material').append(item.crafting_material);
				
				var suffix_item_id = 0;
				var itemstat = item.weapon || item.armor || item.back || item.trinket || item.upgrade_component || item.consumable;
				var stats$ = details$.find('.stats').hide();
				if (itemstat) {
					if (itemstat.type && itemstat.type !== 'Default' && itemstat.type !== 'Generic') {
						details$.addClass(flagToClass(itemstat.type, 'subtype')).find('.item-type').empty().append(splitName(itemstat.type));
					}
					if (itemstat.damage_type) {
						stats$.find('.damage-type').append(itemstat.damage_type);
					}
					if (itemstat.weight_class) {
						stats$.find('.weight-class').append(itemstat.weight_class);
					}
					if (itemstat.min_power || itemstat.max_power) {
						stats$.find('.min-power').append(itemstat.min_power);
						stats$.find('.max-power').append(itemstat.max_power);
					}
					if (typeof itemstat.defense !== 'undefined') {
						stats$.find('.defense').append(itemstat.defense);
					}
					if (itemstat.infusion_slots) {
						for (var i = 0; i < itemstat.infusion_slots.length; i++) {
							var inf = itemstat.infusion_slots[i];
							stats$.find('.infusion-slots').append('<span class="infusion-slot">' + parseInfusionFlags(inf.flags) + '</span>');
						}
					}
					if (itemstat.infix_upgrade) {
						if (itemstat.infix_upgrade.buff) {
							stats$.find('.buff').append(stripHtml(itemstat.infix_upgrade.buff.description));
						}
						for (var a = 0; a < itemstat.infix_upgrade.attributes.length; a++) {
							var attrib = itemstat.infix_upgrade.attributes[a];
							stats$.find('.attributes').append('<span class="attribute">' + (attrib.modifier < 0 ? '-' : '+') + attrib.modifier + 
								' ' + splitName(attrib.attribute) + '</span>');
						}
					} else if (itemstat.description) { // consumables
						stats$.find('.buff').append(stripHtml(itemstat.description));
					}
					if (itemstat.suffix_item_id) {
						suffix_item_id = itemstat.suffix_item_id;
					}
					if (itemstat.bonuses) {
						var nbonus = itemstat.bonuses.length;
						for (var b = 0; b < nbonus; b++) {
							stats$.find('.attributes').append('<span class="attribute attribute-set attribute-set-' + (b + 1) + '">' + stripHtml(itemstat.bonuses[b]) + ' (' + (b + 1) + '/' + nbonus + ')</span>');
						}
					}
					stats$.show();
				}
				
				// for upgraded items
				var upgrade$ = details$.find('.upgrade').hide();
				if (suffix_item_id) {
					console.log('Loading upgrade item: ' + suffix_item_id);
					fetchItem(suffix_item_id, function(upgrade) {
						if (upgrade && upgrade.upgrade_component) {
							upgrade$.attr('id', 'upgrade_item_' + upgrade.item_id);
							upgrade$.find('.upgrade-name').append(upgrade.name);
							upgrade$.find('.upgrade-rarity').append(upgrade.rarity);
							upgrade$.addClass('upgrade-rarity-' + upgrade.rarity.toLowerCase());
							if (upgrade.upgrade_component.infix_upgrade) {
								if (upgrade.upgrade_component.infix_upgrade.buff) {
									upgrade$.find('.upgrade-buff').append(stripHtml(upgrade.upgrade_component.infix_upgrade.buff.description));
								}
								for (var a = 0; a < upgrade.upgrade_component.infix_upgrade.attributes.length; a++) {
									var attrib = upgrade.upgrade_component.infix_upgrade.attributes[a];
									upgrade$.find('.upgrade-attributes').append('<span class="upgrade-attribute">' + (attrib.modified < 0 ? '-' : '+') + attrib.modifier +
										' ' + splitName(attrib.attribute) + '</span>');
								}
							}
							if (upgrade.upgrade_component.bonuses) {
								var nbonus = upgrade.upgrade_component.bonuses.length;
								for (var b = 0; b < nbonus; b++) {
									upgrade$.find('.upgrade-attributes').append('<span class="upgrade-attribute upgrade-set upgrade-set-' + (b + 1) + '">' + stripHtml(upgrade.upgrade_component.bonuses[b]) + ' (' + (b + 1) + '/' + nbonus + ')</span>');
								}
							}
							upgrade$.show();
						}
					});
				}
				
				$(insertAtSelector).append(details$);
				details$.attr('data-item-rendered', 'true');
				details$.show();
			});
		}
	};
	
	// renders a table of items starting with the specified index in the item list
	function renderItemsStartingAt(elem$, data, index) {
		if (data && data.items && index < data.items.length) {
			// render items
			elem$.empty();
			var opt = elem$.data('gw2items_options') || {};
			for (var i = index; i < data.items.length && (i - index) < opt.pageSize; i++) {
				fetchItem(data.items[i], function(item) {
					if (item && item.item_id) {
						var itemrow$ = $('<tr class="item-rarity-' + item.rarity.toLowerCase() + ' item-type-' + item.type.toLowerCase() +
							'" id="item_' + item.item_id + '"><td>' + item.item_id + '</td><td><a href="#" rel="' + item.item_id + '">' +
							item.name + '</a> ' + createChatTag(item.item_id) + '</td><td>' + (item.level > 0 ? item.level : '&nbsp;') + '</td></tr>');
							
						elem$.append(itemrow$);
						itemrow$.find('a').click(function(evt) {
							evt.preventDefault();
							renderItemDetail($(this).attr('rel'), opt.details, opt.insertAt);
						});
					}
				});
			}
		}
	};
	
	// renders a set of links for paging through the list of items, index is the current item for the top of the page
	function renderPagerStartingAt(elem$, pager$, data, index, pageSize) {
		if (data && data.items && index < data.items.length) {
			// render pager
			pager$.empty();
			var pagerHtml = '| ';
			var pages = Math.floor(data.items.length / pageSize);
			var currentPage = Math.floor(index / pageSize);
			var i = 0;
			var pagesToRender = [];
			while (i < pages) {
				if (i < 10) {
					pagesToRender.push(i);
				} else if (i > currentPage - 5 && i < currentPage + 5) {
					pagesToRender.push(i);
				} else if (i > pages - 10) {
					pagesToRender.push(i);
				}
				i++;
			}
			var last = 0;
			while ((i = pagesToRender.shift()) !== undefined) {
				if ((i - last) > 1) {
					pagerHtml += '... | ';
				}
				if (i === currentPage) {
					pagerHtml += (i + 1) + ' | ';	
				} else {
					pagerHtml += '<a href="#" rel="' + i + '">' + (i + 1) + '</a> | ';
				}
				last = i;
			}
			pager$.append(pagerHtml);
			if (currentPage > 0) {
				pager$.prepend('<a href="#" rel="' + (currentPage - 1) + '">&laquo;</a> ');
			}
			if (currentPage < pages - 1) {
				pager$.append(' <a href="#" rel="' + (currentPage + 1) + '">&raquo;</a>');
			}
			pager$.find('a').click(function(evt) {
				var page = parseInt($(this).attr('rel'));
				renderItemsStartingAt(elem$, data, page * pageSize);
				renderPagerStartingAt(elem$, pager$, data, page * pageSize, pageSize);
			});
		}
	}
	
	// splits a flag name into two words
	function splitName(input) {
		return input.replace(/([a-z])([A-Z])/g, '$1 $2');	
	};
	
	// strips HTML from input, preserving BR tags
	function stripHtml(input) {
		// note this is not a good way to do this with normal HTML, but works for GW2's item db
		var stripped = input.replace(/<br>/ig, '\n');
		stripped = stripped.replace(/(<([^>]+)>)/ig, '');
		stripped = stripped.replace(/\n|\\n/g, '<br>');
		return stripped;
	};
	
	// attempts to place the given object into the local storage
	var stuffStorage = supports_html5_storage() ? function(key, value, lang) {
		if (key && value) {
			if (!!lang === false) {
				lang = 'en';
			}
			value.stuffed_at = new Date().getTime();
			window.localStorage.setItem(key + '_' + lang, JSON.stringify(value));
		}
	} : function(key, value, lang) { };
	
	// feature support: base64 encoding with window.btoa() (Gecko/Webkit usu.)
	function supports_base64() {
		try {
			return 'btoa' in window && window['btoa'] !== null;
		} catch (e) {
			return false;
		}
	};
	
	// feature support: HTML5 local storage
	function supports_html5_storage() {
		try {
			return 'localStorage' in window && window['localStorage'] !== null;
		} catch (e) {
			return false;
		}
	};
	
	// plugin for jQuery which begins rendering of GW2 items db
	// the jQuery stack must contain a table (limited for demo purposes)
	$.fn.gw2items = function(options) {
		options = options || {};
		if (!!options.details === false) {
			throw new Error('No template specified!');
		}
		options.pageSize = options.pageSize || DEFAULT_PAGE_SIZE;
		options.insertAt = options.insertAt || 'body';
		if (this.get(0).tagName.toUpperCase() === 'TABLE') {
			var body$ = this.find('tbody');
			if (body$.length === 0) {
				body$ = this.append('<tbody></tbody>').find('tbody');
			}
			body$.data('gw2items_options', options);
			var pager$ = this.find('.pager');
			
			fetchItemIDs(function(data) {
				renderItemsStartingAt(body$, data, 0);
				renderPagerStartingAt(body$, pager$, data, 0, options.pageSize);
			});
		}
		return this;	
	};
	
})(this, jQuery);