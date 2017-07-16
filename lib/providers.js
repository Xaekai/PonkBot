/*!
**|   PonkBot Media Provider APIs
**@
*/

'use strict';

const request = require('request');

class YouTubeAPI {
    constructor(ponk){
        Object.assign(this, {
            key     : ponk.API.keys.youtube,
            agent   : ponk.API.agent,
            pool    : new require('https').Agent({ maxSockets: 4 }),
            timeout : 5 * 1000
        });
    }

    get requestOpts(){
        return {
            pool    : this.pool,
            timeout : this.timeout,
            headers : { 'User-Agent': this.agent }
        }
    }

    // https://developers.google.com/youtube/v3/docs/videos
    lookup(vidid){
        return new Promise((resolve, reject)=>{
            const params = [
                'part=' + 'id,snippet,contentDetails,status',
                'id='   + vidid,
                'key='  + this.key
            ].join('&');

            const url = `https://www.googleapis.com/youtube/v3/videos?${params}`;
            request(Object.assign({ url }, this.requestOpts), (error, response, body) => {
                if(error){
                    return reject({ reason: 'General error', error });
                }
                if(response.statusCode !== 200){
                    return reject({ reason: 'Request failure', error: response.statusCode });
                }

                let data;
                try {
                    data = JSON.parse(body);
                }
                catch(error){
                    return reject({ reason: 'JSON parse failed', error });
                }

                if(data.error){
                    let error = data.error.errors.shift();
                    if(error.reason === 'keyInvalid'){
                        return reject({ reason: 'Invalid API key', error: data.error });
                    }
                    return reject({ reason: 'Errors occured', error: data.error });
                }

                if (data.pageInfo.totalResults === 0) {
                    return reject({ reason: 'Video not found', error: data });
                }

                // YouTube a shit
                // This video was removed for ToS violation: IfnxIiW17JI
                // Google's API says totalResults = 1 but provides an empty items list
                // The API provides nothing about the ToS violation
                if (data.items.length === 0) {
                    return reject({ reason: 'Video removed', error: data });
                }

                const { id, contentDetails, status } = data.items.shift();

                return resolve({ id, contentDetails, status });
            });
        });
    }
}

module.exports = {
    meta: {
        active: true,
        type: 'laughter'
    },
    giggle: function(ponk){
        return new Promise((resolve, reject)=>{
            const keys = ponk.API.keys;
            const available = [];
            switch(true){
                case !!keys.youtube:
                    ponk.logger.log('Registering YouTube API');
                    ponk.API.yt = new YouTubeAPI(ponk);
                    available.push('yt');
                // TODO: Vimeo and DailyMotion
            }
            return resolve(available);
        })
    },
    laughter: function(ponk, avaiable){
        ponk.validators.available = [...avaiable];
        ponk.logger.log('Available validators: ', avaiable);
    }
}
