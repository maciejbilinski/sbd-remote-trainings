window.addEventListener('load', function () {
    let daysOfTheWeek = [
        'pon',
        'wt',
        'śr',
        'czw',
        'pt',
        'sob',
        'nd'
    ];

    let exerciseCount = [0, 0, 0, 0, 0, 0, 0];

    if (results.length) {
        results.forEach(n => {
            if (n.DZIEN == 'PONIEDZIAŁEK') {
                exerciseCount[0] = n.N;
            } else if (n.DZIEN == 'WTOREK') {
                exerciseCount[1] = n.N;
            } else if (n.DZIEN == 'ŚRODA') {
                exerciseCount[2] = n.N;
            } else if (n.DZIEN == 'CZWARTEK') {
                exerciseCount[3] = n.N;
            } else if (n.DZIEN == 'PIĄTEK') {
                exerciseCount[4] = n.N;
            } else if (n.DZIEN == 'SOBOTA') {
                exerciseCount[5] = n.N;
            } else if (n.DZIEN == 'NIEDZIELA') {
                exerciseCount[6] = n.N;
            }
        });
    }


    new Chart("cockpitChart", {
        type: "line",
        data: {
            labels: daysOfTheWeek,
            datasets: [{
                data: exerciseCount,
                label: 'Wykonane treningi'
            }]
        },
        options: {
            scales: {
                y: {
                    min: 0,
                    ticks: {
                        beginAtZero: true,
                        callback: function (value) { if (value % 1 === 0) { return value; } }
                    }
                }
            }
        }
    });
});