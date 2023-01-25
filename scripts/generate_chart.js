window.addEventListener('load', function () {
    let daysOfTheWeek = [
        'pon',
        'wt',
        'śr',
        'czw',
        'pt',
        'sob',
        'ndz'
    ];

    let exerciseCount = [0, 0, 0, 0, 0, 0, 0];

    if (results.length) {
        results.forEach(n => {
            if (n.DZIEN.includes('PONIEDZIAŁEK')) {
                exerciseCount[0] = n.N;
            } else if (n.DZIEN.includes('WTOREK')) {
                exerciseCount[1] = n.N;
            } else if (n.DZIEN.includes('ŚRODA')) {
                exerciseCount[2] = n.N;
            } else if (n.DZIEN.includes('CZWARTEK')) {
                exerciseCount[3] = n.N;
            } else if (n.DZIEN.includes('PIĄTEK')) {
                exerciseCount[4] = n.N;
            } else if (n.DZIEN.includes('SOBOTA')) {
                exerciseCount[5] = n.N;
            } else if (n.DZIEN.includes('NIEDZIELA')) {
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
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: 'Wykonane treningi',
                    color: '#dddddd'
                }
            },
            scales: {
                y: {
                    min: 0,
                    suggestedMax: 3,
                    ticks: {
                        beginAtZero: true,
                        color: '#dddddd',
                        callback: function (value) { if (value % 1 === 0) { return value; } }
                    },
                    grid: {
                        color: '#555555',
                        display: true
                    }
                },
                x: {
                    ticks: {
                        color: '#dddddd'
                    },
                    grid: {
                        color: '#555555',
                        display: true
                    }
                }
            }
        }
    });
});