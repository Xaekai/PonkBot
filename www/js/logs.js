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
        $('#logviewer').text('No History')
    }
    $('#logviewer').scrollTop($('#logviewer').prop('scrollHeight'))
}


function createMediaTable(mediaTable){
    $('#logviewer').text('').empty();

    var table = $('<table>').addClass('table table-striped table-condensed').appendTo($('#logviewer'));
    var thead = $('<thead>').appendTo(table);
    var theadr = $('<tr>').appendTo(thead);

    $('<th>').text('Timestamp').appendTo(theadr);
    $('<th>').text('Shortcode').appendTo(theadr);
    $('<th>').text('Title').appendTo(theadr);

    var tbody = $('<tbody>').appendTo(table);
    mediaTable.forEach((cv)=>{
        var truncate = 80
        var trow = $('<tr/>').appendTo(tbody);

        var timestamp = $('<code/>')
            .text(new Date(parseInt(cv.time)))
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

    })

}

function setHighlight(target){
    $('ul.lognav button').removeClass('active btn-primary');
    $(target).addClass('active btn-primary');
}

$(document).ready(function() {
    LOGIDS.forEach(logid => {
        if(logid === 'medialog'){ return }
        $(`#${logid}`).on('click', function(){
            setHighlight(this);
            readLogFile(logid, handleLogData);
        });
    })
    $('#medialog').on('click',  function(){ setHighlight(this); readLogFile('medialog', handleMediaLog); });
})

