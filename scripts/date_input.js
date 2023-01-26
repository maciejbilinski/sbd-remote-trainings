function formatDate(d) {
    var month = '' + (d.getMonth() + 1),
        day = '' + d.getDate(),
        year = d.getFullYear();

    if (month.length < 2) 
        month = '0' + month;
    if (day.length < 2) 
        day = '0' + day;

    return [year, month, day].join('-');
}
window.addEventListener('load', function(){
    var date = new Date();
    date.setDate(date.getDate() + 1)

    document.querySelectorAll('input.date-input').forEach(function(input){
        input.min = formatDate(date)
        input.addEventListener('focus', function(){
            input.type = 'date';
        });
        input.addEventListener('focusout', function(){
            if(!input.value){
                input.type = 'text';
            }
        })
    });

    const end = document.getElementById('endDateInput');
    const start = document.getElementById('startDateInput');
    end.addEventListener('focus', function(){
        end.min = start.value;
        end.type = 'datetime-local';
    });
    end.addEventListener('focusout', function(){
        if(!end.value){
            end.type = 'text';
        }
    })
    start.addEventListener('focus', function(){
        if(end.value){
            start.max = end.value;
        }else{
            start.removeAttribute('max');
        }
    });
});