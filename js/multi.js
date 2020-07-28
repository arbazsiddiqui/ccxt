'use strict';

//  ---------------------------------------------------------------------------

const Exchange = require ('./base/Exchange');
//  ---------------------------------------------------------------------------

module.exports = class multi extends Exchange {
    describe () {
        return this.deepExtend (super.describe (), {
            'id': 'multi',
            'name': 'multi',
            'countries': [ 'SG' ],
            'version': 'v1',
            'has': {
                'fetchMarkets': true,
                'fetchCurrencies': true,
                'fetchOrderBook': true,
                'fetchOHLCV': true,
                'fetchTradingFees': true,
                'fetchTrades': true,
                'fetchTradingLimits': false,
                'fetchFundingLimits': false,
                'fetchTicker': true,
                'fetchBalance': true,
                'fetchAccounts': false,
                'createOrder': true,
                'cancelOrder': true,
                'fetchDepositAddress': true,
            },
            'timeframes': {
                '1h': '1h',
                '4h': '4h',
                '8h': '8h',
                '1d': '1d',
                '1w': '1w',
            },
            'urls': {
                'logo': 'https://multi.io/en/static/img/icons/logo_white.svg',
                'api': 'https://staging-api.multi.io/api',
                'www': 'https://multi.io/',
                'doc': 'https://docs.multi.io/',
            },
            'api': {
                'public': {
                    'get': [
                        'market/list',
                        'asset/list',
                        'order/depth',
                        'market/kline',
                        'fee_schedules',
                        'market/trade',
                        'market/status/all',
                    ],
                },
                'private': {
                    'get': [
                        'asset/balance',
                    ],
                    'post': [
                        'asset/deposit',
                        'order',
                        'order/cancel',
                    ],
                },
            },
        });
    }

    async fetchMarkets (params = {}) {
        const response = await this.publicGetMarketList (params);
        return this.parseMarkets (response);
    }

    parseMarkets (markets) {
        const result = [];
        for (let i = 0; i < markets.length; i++) {
            const market = markets[i];
            const base = this.safeCurrencyCode (market['pair']);
            const quote = this.safeCurrencyCode (market['base']);
            const symbol = base + '/' + quote;
            const precision = {
                'amount': this.safeInteger (market, 'pairPrec'),
                'price': this.safeInteger (market, 'basePrec'),
            };
            result.push ({
                'id': market['name'],
                'symbol': symbol,
                'base': base,
                'quote': quote,
                'baseId': base.toLowerCase (),
                'quoteId': quote.toLowerCase (),
                'active': true,
                'precision': precision,
                'limits': {
                    'amount': {
                        'min': this.safeFloat (market, 'minAmount'),
                        'max': undefined,
                    },
                    'price': {
                        'min': undefined,
                        'max': undefined,
                    },
                    'cost': {
                        'min': undefined,
                        'max': undefined,
                    },
                },
                'info': market,
            });
        }
        return result;
    }

    async fetchCurrencies (params = {}) {
        const response = await this.publicGetAssetList (params);
        return this.parseCurrencies (response);
    }

    parseCurrencies (currencies) {
        const result = {};
        for (let i = 0; i < currencies.length; i++) {
            const currency = currencies[i];
            const currencyCode = this.safeString (currency, 'name');
            const id = currencyCode.toLowerCase ();
            const numericId = this.safeInteger (currency, 'id');
            const code = this.safeCurrencyCode (currencyCode);
            const name = this.safeString (currency, 'displayName');
            const active = this.safeValue (currency, 'status');
            const fee = this.safeFloat (currency, 'withdrawFee');
            const precision = this.safeFloat (currency, 'precWithdraw');
            result[code] = {
                'id': id,
                'numericId': numericId,
                'code': code,
                'info': currency,
                'name': name,
                'active': active,
                'fee': fee,
                'precision': precision,
                'limits': {
                    'amount': {
                        'min': this.safeFloat (currency, 'minAmount'),
                        'max': undefined,
                    },
                    'price': {
                        'min': undefined,
                        'max': undefined,
                    },
                    'cost': {
                        'min': undefined,
                        'max': undefined,
                    },
                    'withdraw': {
                        'min': this.safeFloat (currency, 'minWithdrawAmount'),
                        'max': undefined,
                    },
                },
            };
        }
        return result;
    }

    async fetchOrderBook (symbol, limit = undefined, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'market': market['id'],
        };
        if (limit !== undefined) {
            request['limit'] = limit; // default = 20
        }
        const response = await this.publicGetOrderDepth (this.extend (request, params));
        const timestamp = this.safeInteger (response, 'timestamp');
        return this.parseOrderBook (response, timestamp * 1000);
    }

    async fetchOHLCV (symbol, timeframe = '1h', since = 86400000, limit = undefined, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'market': market['id'],
        };
        const period = this.safeString (this.timeframes, timeframe);
        const intervalInSeconds = this.parseTimeframe (period);
        request['interval'] = intervalInSeconds;
        const now = this.seconds ();
        if (since !== undefined) {
            if (limit !== undefined) {
                const start = now - limit * intervalInSeconds;
                request['start'] = parseInt (start);
                request['end'] = parseInt (now);
            } else {
                request['end'] = parseInt (now);
            }
        } else {
            request['start'] = parseInt (since / 1000);
            request['end'] = parseInt (now);
        }
        const response = await this.publicGetMarketKline (this.extend (request, params));
        return this.parseOHLCVs (response, market, timeframe, since, limit);
    }

    async fetchTradingFees (params = {}) {
        await this.loadMarkets ();
        const response = await this.publicGetFeeSchedules (params);
        const fees = [];
        for (let i = 0; i < response.length; i++) {
            const fee = response[i];
            fees.push ({
                'minVolume': fee['minVolume'],
                'maker': fee['makerFee'],
                'taker': fee['takerFee'],
            });
        }
        return {
            'info': response,
            'fees': fees,
        };
    }

    async fetchTrades (symbol, since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'market': market['id'],
        };
        if (limit !== undefined) {
            request['limit'] = limit;
        }
        const response = await this.publicGetMarketTrade (this.extend (request, params));
        return this.parseTrades (response['result'], market, since, limit);
    }

    parseTrade (trade, market) {
        const symbol = market['symbol'];
        const timestamp = this.safeTimestamp (trade, 'time');
        const price = this.safeFloat (trade, 'price');
        const amount = this.safeFloat (trade, 'amount');
        return {
            'info': trade,
            'id': this.safeString (trade, 'id'),
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'symbol': symbol,
            'side': trade['type'],
            'price': price,
            'amount': amount,
            'cost': parseFloat (price * amount),
            'order': undefined,
            'takerOrMaker': undefined,
            'type': undefined,
            'fee': undefined,
        };
    }

    async fetchTicker (symbol, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const marketId = market['id'];
        const response = await this.publicGetMarketStatusAll (params);
        const marketTicket = this.getMarketTicket (response, marketId);
        return this.parseTicker (marketTicket['result'], symbol);
    }

    getMarketTicket (response, marketId) {
        const marketTicker = {};
        for (let i = 0; i < response.length; i++) {
            if (response[i]['market'] === marketId) {
                marketTicker['result'] = response[i];
                break;
            }
        }
        return marketTicker;
    }

    parseTicker (ticker, symbol) {
        return {
            'symbol': symbol,
            'info': ticker,
            'high': ticker['high'],
            'low': ticker['low'],
            'bid': ticker['bid'],
            'bidVolume': undefined,
            'ask': ticker['ask'],
            'open': ticker['open'],
            'close': ticker['close'],
            'last': ticker['close'],
            'baseVolume': ticker['pairVolume'],
            'quoteVolume': ticker['baseVolume'],
            'askVolume': undefined,
            'average': undefined,
            'change': undefined,
            'datetime': undefined,
            'percentage': undefined,
            'previousClose': undefined,
            'timestamp': undefined,
            'vwap': undefined,
        };
    }

    async fetchBalance (params = {}) {
        await this.loadMarkets ();
        const response = await this.privateGetAssetBalance (params);
        const exchange = response['exchange'];
        const keys = Object.keys (exchange);
        const result = { 'info': exchange };
        for (let i = 0; i < keys.length; i++) {
            const code = keys[i];
            result[code] = {
                'free': parseFloat (exchange[code]['available']),
                'used': parseFloat (exchange[code]['freeze']),
            };
        }
        return this.parseBalance (result);
    }

    async fetchDepositAddress (code, params = {}) {
        await this.loadMarkets ();
        const currency = this.currency (code);
        const request = {
            'symbol': currency['code'],
        };
        const response = await this.privatePostAssetDeposit (this.extend (request, params));
        const currencyObject = this.safeValue (response, code);
        return {
            'currency': code,
            'address': currencyObject['address'],
            'tag': this.safeValue (currencyObject, 'memo'),
            'info': currencyObject,
        };
    }

    async createOrder (symbol, type, side, amount, price = undefined, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'market': market['id'],
            'side': (side === 'sell') ? 1 : 2,
            'amount': amount,
            'price': price,
            'type': type,
        };
        if (this.safeValue (params, 'type') === 'stopLimit') {
            request['type'] = 'stoplimit';
            request['stop'] = this.safeValue (params, 'stopPrice');
            request['gtlt'] = this.safeValue (params, 'gtlt', 1);
            params = this.omit (params, [ 'type', 'stopPrice', 'gtlt' ]);
        }
        const response = await this.privatePostOrder (this.extend (request, params));
        return this.parseOrder (response, market);
    }

    parseOrder (order, market) {
        const timestamp = this.safeTimestamp (order, 'cTime');
        const orderType = this.safeString (order, 'type');
        const orderSide = this.safeString (order, 'side');
        const type = (orderType === '1') ? 'limit' : 'market';
        const side = (orderSide === '1') ? 'sell' : 'buy';
        const amount = this.safeFloat (order, 'amount');
        const filled = amount - this.safeFloat (order, 'left');
        const fee = {};
        if (side === 'buy') {
            fee['cost'] = order['takerFee'];
        } else {
            fee['cost'] = order['makerFee'];
        }
        fee['currency'] = market['base'];
        return {
            'id': this.safeString (order, 'id'),
            'clientOrderId': undefined,
            'datetime': this.iso8601 (timestamp),
            'timestamp': timestamp,
            'lastTradeTimestamp': undefined,
            'status': undefined,
            'symbol': market['symbol'],
            'type': type,
            'side': side,
            'price': this.safeFloat (order, 'price'),
            'average': undefined,
            'amount': amount,
            'filled': filled,
            'remaining': this.safeFloat (order, 'left'),
            'cost': parseFloat (filled * amount),
            'trades': undefined,
            'fee': fee,
            'info': order,
        };
    }

    sign (path, api = 'public', method = 'GET', params = undefined, headers = undefined, body = undefined) {
        let url = this.urls['api'] + '/' + this.version + '/' + path;
        const query = this.omit (params, this.extractParams (path));
        if (method === 'GET') {
            if (Object.keys (params).length) {
                url += '?' + this.urlencode (params);
            }
        }
        if (api === 'private') {
            this.checkRequiredCredentials ();
            const timestamp = Math.floor (this.milliseconds () / 1000);
            let payloadToSign = {};
            if (method === 'GET' && params) {
                payloadToSign = {};
            }
            if (method === 'POST') {
                body = this.json (query);
                payloadToSign = query;
            }
            const message = this._makeQueryString (this.extend ({}, payloadToSign, { timestamp, method, path })).substr (1);
            const signature = this.hmac (this.encode (message), this.encode (this.secret), 'sha256', 'hex');
            headers = {
                'Content-Type': 'application/json',
                'X-MULTI-API-KEY': this.apiKey,
                'X-MULTI-API-SIGNATURE': signature,
                'X-MULTI-API-TIMESTAMP': timestamp,
                'X-MULTI-API-SIGNED-PATH': path,
            };
        }
        return { 'url': url, 'method': method, 'body': body, 'headers': headers };
    }

    _makeQueryString (q) {
        const arr = [];
        if (q) {
            const sortedParams = this.keysort (q);
            const keys = Object.keys (sortedParams);
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                arr.push (this.encodeURIComponent (key) + '=' + this.encodeURIComponent (q[key]));
            }
            return '?' + arr.join ('&');
        } else {
            return '';
        }
    }

    async request (path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        const response = await this.fetch2 (path, api, method, params, headers, body);
        return response['data'];
    }
};
