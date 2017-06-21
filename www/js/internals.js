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

    return `${h.slice(-2)}h ${m.slice(-2)}m ${s.slice(-2)}s`;
}

function formatMedia({ type, id, title, duration, currentTime, paused }){
    return `${type}:${id} <br> ${title} -- ${duration} <br> ${currentTime.toFixed(2)}s | ${paused ? 'Paused' : 'Playing'}`;
}


socket.on('connect', ()=>{
    console.log('Connection established.');
    tickerInternals = setInterval(()=>{ socket.emit('getInternals') }, 250);
    tickerUserlist  = setInterval(()=>{ socket.emit('getUserlist') }, 60000); socket.emit('getUserlist');
    tickerPlaylist  = setInterval(()=>{ socket.emit('getPlaylist') }, 60000); socket.emit('getPlaylist');
});

socket.on('disconnect', ()=>{
    console.log('Lost connection to bot.');
    clearInterval(tickerInternals);
    clearInterval(tickerUserlist);
    clearInterval(tickerPlaylist);
});


/*
    I could have put this in the template, 
        but then it wouldn't be as easy to edit.
*/
// Build table for the core data
socket.once('coreData', ()=>{
    const table = $('<table>').addClass('table table-bordered table-hover').appendTo($('#coredata_content'));

    const props = {
        started   : 'Started',
        uptime    : 'Uptime',
        heapTotal : 'Memory heap total',
        heapUsed  : 'Memory heap used',
        host      : 'CyTube Server',
        chan      : 'CyTube Room',
        user      : 'CyTube User',
        weblink   : 'Web Link',
        webport   : 'Web Port',
        sockport  : 'Socket Port',
        leader    : 'Leader',
        prevUID   : 'Previous UID',
        currUID   : 'Current UID',
        currMedia : 'Current Media',
    }

    Object.keys(props).forEach((key)=>{
        const tr = $('<tr>').appendTo(table);
        $('<th>').text(`${props[key]}:`).appendTo(tr);
        $('<td>').attr('id', `coredata_${key}`).appendTo(tr);
    });

});

// Handle the core data
socket.on('coreData', (coreData)=>{
    const { host, chan, user, 
            sockport, weblink, webport, 
            prevUID, currUID, currMedia, 
            leader, heapTotal, heapUsed, started 
        } = coreData;

    $('#coredata_started')   .text(`${String(new Date(started)).split(/\s/).splice(1,4).join(' ')} (${started})`);
    $('#coredata_uptime')    .text(`${uptime(started)}`);
    $('#coredata_heapTotal') .text(`${heapTotal}`);
    $('#coredata_heapUsed')  .text(`${heapUsed}`);
    $('#coredata_host')      .text(`${host}`);
    $('#coredata_chan')      .text(`${chan}`);
    $('#coredata_user')      .text(`${user}`);
    $('#coredata_weblink')   .text(`${weblink}`);
    $('#coredata_webport')   .text(`${webport}`);
    $('#coredata_sockport')  .text(`${sockport}`);
    $('#coredata_leader')    .text(`${leader}`);
    $('#coredata_prevUID')   .text(`${prevUID}`);
    $('#coredata_currUID')   .text(`${currUID}`);
    $('#coredata_currMedia') .html(`${formatMedia(currMedia)}`);

});


// Build table for userlist
socket.once('userlist', (data, moderator)=>{
    const table = $('<table>').addClass('table table-condensed table-bordered table-hover').appendTo($('#userlist_content'));
    const thead = $('<thead>').appendTo(table);
    const theadr = $('<tr>').appendTo(thead);

    $('<th>').text('Name').appendTo(theadr);
    $('<th>').text('Rank').appendTo(theadr);
    $('<th>').text('AFK').appendTo(theadr);
    $('<th>').text('Muted').appendTo(theadr);
    if(moderator){
        $('<th>').text('Shadow').appendTo(theadr);
    }
    $('<th>').text('Profile Image').appendTo(theadr);
    $('<th>').text('Profile Text').appendTo(theadr);
    if(moderator){
        $('<th>').text('IP').appendTo(theadr);
        $('<th>').text('Aliases').appendTo(theadr);
    }

    $('<tbody>').attr('id','userlist_body').appendTo(table);
});


// Handle the userlist
socket.on('userlist', function(userlist, moderator) {
    userlist.sort((a,b)=>{
        if(b.rank !== a.rank){
            return b.rank-a.rank;
        }
        const c = a.name, d = b.name;
        return c.localeCompare(d);
    });

    const tbody = $('#userlist_body').html('');
    userlist.forEach(({ name, rank, profile, meta })=>{
        const row = $('<tr>').appendTo(tbody);
        $('<td>').appendTo(row).text(name);
        $('<td>').appendTo(row).text(rank);
        $('<td>').appendTo(row).html(meta.afk ? '&#x2611;' : '&#x2610;');
        $('<td>').appendTo(row).html(meta.muted ? '&#x2611;' : '&#x2610;');
        if(moderator){
            $('<td>').appendTo(row).html(meta.smuted ? '&#x2611;' : '&#x2610;');
        }
        $('<td>').appendTo(row).html(`<img style="max-height: 32px" src="${profile.image}">`);
        $('<td>').appendTo(row).text(profile.text);
        if(moderator){
            $('<td>').appendTo(row).text(meta.ip);
            $('<td>').appendTo(row).text(meta.aliases);
        }
    });

    $('#userlistspan').text('Number of users: ' + userlist.length);

});


// Build table for playlist
socket.once('playlist', ()=>{
    const table = $('<table>').addClass('table table-condensed table-bordered table-hover').appendTo($('#playlist_content'));
    const thead = $('<thead>').appendTo(table);
    const theadr = $('<tr>').appendTo(thead);

    $('<th>').text('Media Code').appendTo(theadr);
    $('<th>').text('Title').appendTo(theadr);
    $('<th>').text('Duration').appendTo(theadr);
    $('<th>').text('UID').appendTo(theadr);
    $('<th>').text('Temp').appendTo(theadr);
    $('<th>').text('Queuer').appendTo(theadr);

    $('<tbody>').attr('id','playlist_body').appendTo(table);
});

// Handle the playlist
socket.on('playlist', function(playlist) {
    const tbody = $('#playlist_body').html('');

    playlist.forEach(({ media, uid, temp, queueby })=>{
        const row = $('<tr>').appendTo(tbody);
        $('<td>').appendTo(row).text(`${media.type}:${media.id}`);
        $('<td>').appendTo(row).text(media.title);
        $('<td>').appendTo(row).text(media.duration);
        $('<td>').appendTo(row).text(uid);
        $('<td>').appendTo(row).html(temp ? '&#x2611;' : '&#x2610;');
        $('<td>').appendTo(row).text(queueby);
    });
});
