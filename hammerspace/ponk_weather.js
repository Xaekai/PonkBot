/*!
**|   PonkBot Cloudsdale Connection
**@
*/

'use strict';

const request = require('request');

class WeatherUnderground {
    constructor(ponk){
        Object.assign(this, {
            key     : ponk.API.keys.wunderground,
            agent   : ponk.API.agent,
            pool    : new require('https').Agent({ maxSockets: 2 }),
            timeout : 15 * 1000
        });
    }

    get requestOpts(){
        return {
            pool    : this.pool,
            timeout : this.timeout,
            headers : { 'User-Agent': this.agent }
        }
    }

    getWeather(data) {
        return this.weatherMare(data, false);
    }

    getForecast(data) {
        return this.weatherMare(data, true);
    }

    weatherMare(data, isForecast) {
        return new Promise((resolve, reject)=>{
            let url;

            if (data.split(' ').length === 1) {
                url = `https://api.wunderground.com/api/${this.key}/conditions${isForecast ? '/forecast' : ''}/q/${data}.json`;
                request(Object.assign({ url }, this.requestOpts), (error, response, body) => {
                    if(error){
                        reject(error);
                    } else {
                        resolve(body);
                    }
                });
            }
            else {
                try {
                    const query = this.parseLocation(data);
                    url = `https://api.wunderground.com/api/${this.key}/conditions${isForecast ? '/forecast' : ''}/q/${query}.json`;

                    request(Object.assign({ url }, this.requestOpts), (error, response, body) => {
                        if(error){
                            reject(error);
                        } else {
                            resolve(body);
                        }
                    });
                } catch (error) {
                    reject(error);
                }
            }
        });
    }

    parseLocation(data){
        var params = data.replace(/,/g,'')
                         .replace(/\s+/g, ' ')
                         .split(' ');

        const country = params.pop();
        const rest = params.join('_');

        return `${country}${rest.length ? '/'+rest : ''}`;
    }

    parseForecast({ json : data, tomorrow, full }) {
        const location = data.current_observation.display_location.full;

        const forecast = {
            todayDay      : data.forecast.txt_forecast.forecastday[0],
            todayNight    : data.forecast.txt_forecast.forecastday[1],
            tomorrowDay   : data.forecast.txt_forecast.forecastday[2],
            tomorrowNight : data.forecast.txt_forecast.forecastday[3],
        }

        let report = [];
        report.push('Location: ' + location);
        if (!tomorrow || full) {
            if ((location.split(', ')[1]).length != 2) {
                report.push('Today: '   + forecast.todayDay.fcttext_metric);
                report.push('Tonight: ' + forecast.todayNight.fcttext_metric);
            } else {
                report.push('Today: '   + forecast.todayDay.fcttext);
                report.push('Tonight: ' + forecast.todayNight.fcttext);
            }
        }
        if (tomorrow || full) {
            if ((location.split(', ')[1]).length != 2) {
                report.push('Tomorrow: '       + forecast.tomorrowDay.fcttext_metric);
                report.push('Tomorrow Night: ' + forecast.tomorrowNight.fcttext_metric);
            } else {
                report.push('Tomorrow: '       + forecast.tomorrowDay.fcttext);
                report.push('Tomorrow Night: ' + forecast.tomorrowNight.fcttext);
            }
        }
        return report;
    }

}


module.exports = {
    meta: {
        active: true,
        type: 'giggle'
    },
    giggle: function(ponk){
        // TODO: Handle absence of keys in config file
        return new Promise((resolve, reject)=>{
            ponk.API.wu = new WeatherUnderground(ponk);
            ponk.logger.log('Registering Weather API');
            resolve();
        })
    },
    handlers: {
        'forecast': function(user, params, meta){
            if (this.muted || !this.API.wu || !params){
                return
            }

            this.checkCooldown({
                type: 'weather', user
            }).then(()=>{

                const tomorrow = params.match(/tomorrow$/);
                if (tomorrow){
                    params = params.replace(/tomorrow$/i, '');
                }
                const full = params.match(/full$|complete$|long$/i);
                if (full){
                    params = params.replace(/full$|complete$|long$/i, '');
                }

                const postAPI = (resp) => {
                    const data = JSON.parse(resp);
                    if (data.response.error || data.response.results){
                        this.logger.error('Weather parse error', data.response);
                        return this.sendMessage('[Weather] Something went wrong parsing the response.');
                    }

                    const forecastData = {
                        json: data,
                        tomorrow, full
                    }

                    var forecastStrings = this.API.wu.parseForecast(forecastData);

                    // Add a newline to the first message
                    const first = forecastStrings.shift();
                    this.sendMessage(`\n[Weather] ${first}`);

                    forecastStrings.forEach((string) => {
                        this.sendMessage(`[Weather] ${string}`);
                    })
                }

                this.API.wu.getForecast(params).then(postAPI, (err)=>{
                    this.sendMessage(`[Weather] Something went wrong. ${err}`);
                })

            },(message)=>{
                if(message.match(/shared/i)){
                    // Chat commands shouldn't use in-depth knowledge of the underlaying API.
                    // I should make the Cooldowns system have a mechanism to provide this.
                    const now = Date.now();
                    const limiter = this.cooldowns.data[this.name]['weather'];
                    const waitTime = (( limiter.curIntervalStart + limiter.tokenBucket.interval ) - now ) / 1000

                    this.sendPrivate(`Too many requests sent. Available in: ${waitTime} seconds`, user);
                    return;
                }
                this.sendPrivate(message, user);
            });
        },

        'weather': function(user, params, meta){
            if (this.muted || !this.API.wu || !params){
                return
            }

            this.checkCooldown({
                type: 'weather', user
            }).then(()=>{
                const postAPI = (resp) => {
                    const data = JSON.parse(resp);
                    if (data.response.error || data.response.results){
                        this.logger.error('Weather parse error', data.response);
                        return this.sendMessage('[Weather] Something went wrong parsing the response.');
                    }

                    const location = data.current_observation.display_location.full;
                    const temp_f   = data.current_observation.temp_f;
                    const temp_c   = data.current_observation.temp_c;
                    const date     = data.current_observation.observation_time;
                    const weather  = data.current_observation.weather;

                    this.sendMessage(
                        `[Weather] Currently ${weather} and ${temp_f}F (${temp_c}C) in ${location}. ${date}`
                        )
                }

                this.API.wu.getWeather(params).then(postAPI, (err)=>{
                    this.sendMessage(`[Weather] Something went wrong. ${err}`);
                })
            },(message)=>{
                if(message.match(/shared/i)){
                    // Chat commands shouldn't use in-depth knowledge of the underlaying API.
                    // I should make the Cooldowns system have a mechanism to provide this.
                    const now = Date.now();
                    const limiter = this.cooldowns.data[this.name]['weather'];
                    const waitTime = (( limiter.curIntervalStart + limiter.tokenBucket.interval ) - now ) / 1000

                    this.sendPrivate(`Too many requests sent. Available in: ${waitTime} seconds`, user);
                    return;
                }
                this.sendPrivate(message, user);
            });
        },

    },
    cooldowns: {
        weather: {
            type           : 'weather',
            name           : 'Weather Module',
            personalType   : 'since',
            personalParams : 10 * 1000,
            sharedType     : 'limiter',
            sharedParams   : ['10', 'minute'],
        }
    },
}

