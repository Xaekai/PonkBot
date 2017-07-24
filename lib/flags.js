/*!
**|   PonkBot Constant Flags
**@
*/

'use strict';

module.exports = Object.freeze({
    MEDIA: {
        GREY  : 1<<0, // Don't randomly queue
        BLACK : 1<<1, // Delete if non-mod queues
        WHITE : 1<<2, // Play more often
    },
    USER: {
    	RED    : 1<<0, // User disallowed from using chat commands
    	ORANGE : 1<<1, // User not allowed to queue videos
    	YELLOW : 1<<2, // User videos not entered into database
    }
});
