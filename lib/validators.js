/*!
**|   PonkBot Validators
**@
*/

'use strict';

module.exports = {
    validators: {
        yt: function(id){
            return new Promise((resolve, reject)=>{
                if(typeof this.API.yt === 'undefined'){
                    resolve({ trash: false });
                }

                // TODO: adding flagging options, and flag video from caller
                // TODO: cache results
                // TODO: throttle requests

                this.logger.log('Media Lookup: yt:' + id)

                this.API.yt.lookup(id).then((mediaData)=>{
                    this.logger.debug(JSON.stringify(mediaData));

                    let blocked = false;
                    let allowed = false;

                    // Countries that block the video
                    try {
                        blocked = mediaData.contentDetails.regionRestriction.blocked;
                    } catch (err) {
                        blocked = false;
                    }

                    // Countries that allow embedding.
                    try {
                        allowed = mediaData.contentDetails.regionRestriction.allowed;
                    } catch (err) {
                        allowed = false;
                    }

                    // Do we have an audience list?
                    if (this.audience.length) {
                        // If not every single country in the audience allows the media to be embedded, trash
                        if (allowed && !this.audience.every(country => allowed.includes(country.toUpperCase()))) {
                            // TODO: Maybe report the countries affected?
                            return resolve({ trash: true, reason: 'Not every country allows embedding.' });
                        }
                        // If any country in the audience has media blocked, trash
                        if (blocked && this.audience.some(country => blocked.includes(country.toUpperCase()))) {
                            return resolve({ trash: true, reason: 'Some countries have blocked this video.' });
                        }
                    }

                    if (!mediaData.status.embeddable) {
                        return resolve({ trash: true, reason: 'This video has embedding disabled.' });
                    }

                    return resolve({ trash: false });
                },(failure)=>{
                    this.logger.debug(JSON.stringify(failure));
                    switch(failure.reason){
                        case 'Invalid API key':
                            this.error.log('Configuration contains an invalid API key for YouTube');
                            process.exit(78);
                        case 'Video not found':
                        case 'Video removed':
                            return resolve({ trash: true, flag: true, reason: failure.reason });
                        default:
                            this.logger.debug('Unhandled validator failure response');
                            this.logger.debug('Failure payload: ', failure);
                            return resolve({ trash: false });
                    }
                });
            });
        },

        // dm: function(id){},
        // vi: function(id){},
        // gd: function(id){},

    }
}

