/*!
**|   Example Configuration
**@
*/

'use strict';

module.exports = {
    ponk: {
        useflair : true,
        peers    : ['OtherBot'],
        audience : ['us'],
    },
    commands: {
        disabled  : ['vodka','taco'],
        trigger   : /^\.|^\!/,
        ignorelog : ['8ball'],
    },
    sync: {
        host : 'cytu.be',
        port : '443', secure: true,
        user : 'MyNewBot',
        auth : 'MyNewBotsPassword',
        chan : 'MyAwesomeCyTubeChannel',
        pass : 'DeleteThisLineIfYouChannelHasNoPassword',
    },
    db: {
        client     : 'sqlite3',
        connection : { filename: 'ponkbot.db' },
    },
    webhost: {
        secret   : 'JustRandomlySmashYourKeyboard',
        weblink  : 'http://mycheap.vps',
        webport  : 'somePortImNotUsing',
        sockport : 'someOtherPortImNotUsing',
    },
    api: {
        youtube      : 'MyYouTubeAPIkey',
        wolfram      : 'MyWolframAPIkey',
        openweather  : 'MyOpenWeatherAPIkey',
        cleverbot    : 'MyCleverBotAPIkey',
    }
}
