/*!
**|   PonkBot Webhost
**@
*/

'use strict';

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const pug = require('pug');

class PonkServer extends EventEmitter {
    constructor(config, logger){
        const defaults = {
            cache     : {},
            templates : path.join(__dirname, '..', 'templates'),
            debug     : (process.env.NODE_ENV === 'production' ? false : true),
        }
        super();
        Object.assign(this, defaults, config)
    }

    sendPug(res, page, locals){
        if(page in this.cache){
            return res.send(this.cache[page](locals));
        }
        const file = path.join(this.templates, page + '.pug');
        const template = pug.compile(fs.readFileSync(file), { filename: file });
        if(!this.debug){
            this.cache[page] = template;
        }
        res.send(template(locals));
    }
}

module.exports = PonkServer;
