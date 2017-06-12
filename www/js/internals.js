/*!
**|   PonkBot Web Interface: Internals
**@
*/

'use strict';

const socket = io(PONKSOCKET);
var tickerInternals, tickerUserlist, tickerPlaylist;


function uptime(startTime) {
    const now = Date.now();
    let time = parseInt(((now - startTime) / 1000), 10);
    let h,m,s;

    // The extra leading zero isn't necessary, but clarifies intent
    h = `00${Math.floor(time / 3600)}`; time %= 3600;
    m = `00${Math.floor(time / 60)}`;
    s = `00${time % 60}`;

    return `${h.slice(-2)}h ${m.slice(-2)}m ${s.slice(-2)}s`
}

function formatMedia({ type, id, title, duration, currentTime, paused }){
    return `${type}:${id} <br> ${title} -- ${duration} <br> ${currentTime}s | ${paused ? 'Paused' : 'Playing'}`
}


socket.on('connect', ()=>{
    console.log('Connection established.');
    tickerInternals = setInterval(()=>{ socket.emit('getInternals') }, 250);
    tickerUserlist = setInterval(()=>{ socket.emit('getUserlist') }, 5000);
    tickerPlaylist = setInterval(()=>{ socket.emit('getPlaylist') }, 5000);
});

socket.on('disconnect', ()=>{
    console.log('Lost connection to bot.');
    clearInterval(tickerInternals);
    clearInterval(tickerUserlist);
    clearInterval(tickerPlaylist);
});


// Handle bot info
socket.on('coreData', function(coreData) {
    const { host, chan, user, 
            sockport, weblink, webport, 
            prevUID, currUID, currMedia, 
            leader, heapTotal, heapUsed, started 
        } = coreData;

    let stuffString = ''
    stuffString += `Started:           ${String(new Date(started)).split(/\s/).splice(1,4).join(' ')} (${started}) <br>`
    stuffString += `Uptime:            ${uptime(started)} <br>`
    stuffString += '<br>'
    stuffString += `Memory heap total: ${heapTotal} <br>`
    stuffString += `Memory heap used:  ${heapUsed} <br>`
    stuffString += '<br>'
    stuffString += `CyTube Server:     ${host} <br>`
    stuffString += `CyTube Room:       ${chan} <br>`
    stuffString += `CyTube User:       ${user} <br>`
    stuffString += '<br>'
    stuffString += `Web Link:          ${weblink} <br>`
    stuffString += `Web Port:          ${webport} <br>`
    stuffString += `Socket Port:       ${sockport} <br>`
    stuffString += '<br>'
    stuffString += `Leader:            ${leader} <br>`
    stuffString += `Previous UID:      ${prevUID} <br>`
    stuffString += `Current UID:       ${currUID} <br>`
    stuffString += `Current Media:     ${formatMedia(currMedia)} <br>`

    $('#coredata_stuff').html(stuffString);
})

