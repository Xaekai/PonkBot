/*!
**|   PonkBot Web Interface: Logs
**@
*/

function readLogFile(logid, handler) {
    $('#logviewer').text('').empty().text('Loading...');
    $.ajax(`${location.protocol}//${location.host}/logs/${logid}`).done(handler);
}

function handleLogData(data) {
    $('#logviewer').text('').empty();
    if(data.length){
        $('<pre>').text(data).appendTo($('#logviewer'));
    } else {
        $('#logviewer').text('No History');
    }

    $('#logviewer').scrollTop($('#logviewer').prop('scrollHeight'));
}

function handleMediaLog(data) {
    // The logger just spits out newlines of objects.
    // Lets assemble them into an array
    var mediaTable = []; data.split('\n').forEach((cv, index, arr)=>{ cv.length && cv.match(/^{/) && mediaTable.push(JSON.parse(cv)) })

    if(mediaTable.length){
        createMediaTable(mediaTable);
    } else {
        $('#logviewer').text('No Media History');
    }
    $('#logviewer').scrollTop($('#logviewer').prop('scrollHeight'));
}

function handleChatLog(data) {
    const chatEntries = [];
    data.split('\n').forEach(item =>{
        if(item.length && item.match(/^{/)){
            chatEntries.push(JSON.parse(item));
        }
    });

    if(chatEntries.length){
        createChatLog(chatEntries);
    } else {
        $('#logviewer').text('No Chat History');
    }
    $('#logviewer').scrollTop($('#logviewer').prop('scrollHeight'));
}


function createMediaTable(mediaTable){
    $('#logviewer').text('').empty();

    var table = $('<table>').attr('id','medialog').addClass('table table-striped table-condensed').appendTo($('#logviewer'));
    var thead = $('<thead>').appendTo(table);
    var theadr = $('<tr>').appendTo(thead);

    $('<th>').text('Timestamp').appendTo(theadr);
    $('<th>').text('Shortcode').appendTo(theadr);
    $('<th>').text('Title').appendTo(theadr);

    var tbody = $('<tbody>').appendTo(table);
    mediaTable.forEach((cv)=>{
        var truncate = 80
        var trow = $('<tr/>').appendTo(tbody);

        const now = (new Date(parseInt(cv.time))).toISOString();

        var timestamp = $('<code/>')
            .text(`${now.slice(0,10)} ${now.slice(11,19)}`)
            .addClass('linewrap')
            .appendTo($('<td/>')
            .appendTo(trow))
            ;

        var shortcode = $('<code/>')
            .text(String().concat(cv.type,':',cv.id.length < truncate ? cv.id : cv.id.slice(0,truncate) + '\u2026'))
            .addClass('linewrap')
            .appendTo($('<td/>')
            .appendTo(trow))
            ;
        if(cv.id.length >= truncate){
            shortcode.attr('title',cv.id)
        }

        var title = $('<code/>')
            .text(cv.title.length < truncate ? cv.title : cv.title.slice(0,truncate) + '\u2026')
            .addClass('linewrap')
            .appendTo($('<td/>')
            .appendTo(trow))
            ;
        if(cv.title.length >= truncate){
            title.attr('title',cv.title)
        }

    });
}


function createChatLog(chatEntries){
    $('#logviewer').text('').empty();

    var table = $('<table>').attr('id','chatlog').addClass('table table-condensed').appendTo($('#logviewer'));

    var thead = $('<thead>').appendTo(table);
    var theadr = $('<tr>').appendTo(thead);
    $('<th>').text('Timestamp').appendTo(theadr);
    $('<th>').text('User').appendTo(theadr);
    $('<th>').text('Message').appendTo(theadr);

    var tbody = $('<tbody>').appendTo(table);

    const truncate = 80;
    chatEntries.forEach(cv =>{
        var trow = $('<tr/>').appendTo(tbody);

        const now = (new Date(parseInt(cv.time))).toISOString();

        var timestamp = $('<code/>')
            .text(`${now.slice(0,10)} ${now.slice(11,19)}`.replace(/\s/g, '\u00A0'))
            .attr('style', 'white-space: nowrap;')
            .appendTo($('<td/>')
            .appendTo(trow))
            ;

        var user = $('<code/>')
            .text(cv.user)
            .appendTo($('<td/>')
            .appendTo(trow))
            ;

        var message = $('<div/>')
            .html(cv.message)
            .addClass('chatMessage')
            .appendTo($('<td/>')
            .appendTo(trow))
            ;

    });
}


function setHighlight(target){
    $('ul.lognav button').removeClass('active btn-primary');
    $(target).addClass('active btn-primary');
}

$(document).ready(function() {
    LOGIDS.forEach(logid => {
        if(/chat|media/.test(logid)){ return }
        $(`#${logid}`).on('click', function(){
            setHighlight(this);
            readLogFile(logid, handleLogData);
        });
    })
    $('#media').on('click', function(){ setHighlight(this); readLogFile('media', handleMediaLog); });
    $('#chat').on('click', function(){ setHighlight(this); readLogFile('chat', handleChatLog); });

    $('#bot').click();
})

