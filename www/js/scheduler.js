/*!
**|   PonkBot Web Interface: Scheduling
**@
*/

'use strict';

const socket = io(PONKSOCKET);

socket.on('connect', () => {
    socket.emit('getSchedule');
});

socket.on('schedule',       (data) => { handleSchedule(data) });
socket.on('scheduleError',  (data) => { handleScheduleError(data) });
socket.on('removal',        (data) => { handleRemoval(data) });
socket.on('removalFailure', (data) => { handleRemovalFailure(data) });
socket.on('removalSuccess', (data) => { handleRemovalSuccess(data) });

function handleRemoval(data){
    console.log('jobRemoved', data);
    return $(`#JobID_${data.remove._id}`).remove();
}

function handleRemovalFailure(message){
    // TODO
}

function handleRemovalSuccess(message){
    // TODO
}

function handleScheduleError(message){
    $('#result').text(message);
}

function handleSchedule(jobs){
    $('#result').text('').empty();

    const table = $('<table>').addClass('table table-striped table-condensed').appendTo($('#result'));
    const thead = $('<thead>').appendTo(table);
    const tbody = $('<tbody>').appendTo(table);
    const theadr = $('<tr>').appendTo(thead);

    $('<th>').text('Delete').appendTo(theadr);
    $('<th>').text('Job ID').appendTo(theadr);
    $('<th>').text('Job Type').appendTo(theadr);
    $('<th>').text('Job Data').appendTo(theadr);
    $('<th>').text('When').appendTo(theadr);

    const example = {
        '_id'            : '575b383d53d0e12008ed8263',
        'name'           : 'queueMedia',
        'data'           : { 'type': 'yt', 'id': '6AoI8Qcp9Ic' },
        'type'           : 'normal',
        'priority'       : 0,
        'nextRunAt'      : '2016-06-12T21:37:42.745Z',
        'lastModifiedBy' : null,
        'lockedAt'       : null,
        'lastRunAt'      : '2016-06-10T21:59:25.861Z',
        'lastFinishedAt' : '2016-06-10T21:59:25.861Z'
    }

    while(jobs.length){
        let job = jobs.shift();

        let trow = $('<tr/>').appendTo(tbody);

        let del = $('<button/>')
            .addClass('btn btn-xs btn-danger')
            .appendTo($('<td/>')
            .appendTo(trow))
            ;
        $('<span/>').addClass('glyphicon glyphicon-trash').appendTo(del);
        del.on('click', function () {
            socket.emit('removeJob', { jobID: job._id });
        });

        trow.attr('id', String().concat('JobID_',job._id))
        let jobID = $('<code/>')
            .text(job._id)
            .addClass('linewrap')
            .appendTo($('<td/>')
            .appendTo(trow))
            ;

        let jobType = $('<code/>')
            .text(job.name)
            .addClass('linewrap')
            .appendTo($('<td/>')
            .appendTo(trow))
            ;

        let jobData = $('<code/>')
            .text(JSON.stringify(job.data))
            .addClass('linewrap')
            .appendTo($('<td/>')
            .appendTo(trow))
            ;

        let when = job.lastRunAt ? new Date(job.lastRunAt) : new Date(job.nextRunAt);
        let jobWhen = $('<code/>')
            .text(when)
            .addClass('linewrap')
            .appendTo($('<td/>')
            .appendTo(trow))
            ;

    }

}

