/*!
**|   PonkBot Web Interface: Statistics
**@
*/

'use strict';

const socket = io(PONKSOCKET);
socket.on('connect', ()=>{
    console.log('Connection established.');
    setTimeout(() => { socket.emit('getStatistics') }, 100);
});

google.load('visualization', '1', {
    'packages': ['corechart', 'annotatedtimeline']
});

google.setOnLoadCallback(function() {
    const pieStyle = {
        backgroundColor: '#404040',
        legend: {
            textStyle: {
                color: 'white',
                fontName: '<global-font-name>',
                fontSize: '<global-font-size>'
            }
        },
        chartArea: {
            left: 0,
            top: 0,
            width: '100%',
            height: '100%'
        },
        pieSliceBorderColor: '#404040'
    }

    socket.on('statistics', ({ mediaStats, messageStats, usersAverage, mediaPopular }) => {

        var mediaStatsTable = new google.visualization.DataTable()
            mediaStatsTable.addColumn('string', 'Topping')
            mediaStatsTable.addColumn('number', 'Slices')
            mediaStatsTable.addRows(mediaStats)
        var mediaChart = new google.visualization.PieChart(document.getElementById('user_video_div'))
            mediaChart.draw(mediaStatsTable, pieStyle)

        var userChatData = new google.visualization.DataTable()
            userChatData.addColumn('string', 'Topping')
            userChatData.addColumn('number', 'Slices')
            userChatData.addRows(messageStats)
        var userChatChart = new google.visualization.PieChart(document.getElementById('user_chat_div'))
            userChatChart.draw(userChatData, pieStyle)

        var averageUserData = new google.visualization.DataTable()
        averageUserData.addColumn('datetime', 'Time')
        averageUserData.addColumn('number', 'Short Moving average')
        averageUserData.addColumn('number', 'Long Moving average')
        averageUserData.addColumn('number', 'Number of Users')
        var smaspan = 24 * 7
        var lmaspan = 24 * 7 * 5
        var sum1 = 0,
            sum2 = 0

        var averageUsers = usersAverage;
        for (var i = 0; i < averageUsers.length; i++) {
            var row
            averageUsers[i][0] = new Date(averageUsers[i][0])
            row = [averageUsers[i][0], 0, 0, averageUsers[i][1]]
            sum1 += averageUsers[i][1]
            sum2 += averageUsers[i][1]
            if (i >= (smaspan - 1)) {
                row[1] = sum1 / smaspan
                sum1 -= averageUsers[i - smaspan + 1][1]
            }
            if (i >= (lmaspan - 1)) {
                row[2] = sum2 / lmaspan
                sum2 -= averageUsers[i - lmaspan + 1][1]
            }
            averageUserData.addRow(row)
        }
        var averageUserTimeline = new google.visualization.AnnotatedTimeLine(document.getElementById('average_user_div'))
        averageUserTimeline.draw(averageUserData, {
            'displayAnnotations': true,
            colors: ['black', 'green', 'orange'],
            max: 50
        })

        const popularVideoTable = $('#popular_video_table > tbody');
        while(mediaPopular.length){
            let media = mediaPopular.shift();
            let row = $('<tr><td class="video"></td><td class="freq"></td></tr>');

            let link;
            switch (media[0]) {
                case 'yt':
                    link = `https://youtube.com/watch?v=${media[1]}`;
                    break
                case 'vm':
                    link = `https://vimeo.com/${media[1]}`;
                    break
                case 'sc':
                    link = '#';
                    break
                case 'bt':
                    link = `https://blip.tv/posts/${media[1]}`;
                    break
                case 'dm':
                    link = `https://www.dailymotion.com/video/${media[1]}`;
                    break
                default:
                    link = '#';
            }

            var title = ''
            if (media[2].length > 50) {
                title = media[2].substring(0, 50)
            } else {
                title = media[2]
            }

            row.children('.video').append($('<a></a>', {
                text: title,
                href: link,
                class: (media[3] ? 'invalid' : ''),
            }));
            row.children('.freq').text(media[4]);
            popularVideoTable.append(row);
        }

        socket.disconnect();
    });
});
