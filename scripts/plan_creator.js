function translateDaysOfWeek(value){
    value = value.toUpperCase();
    if(value === 'PN') return 'Poniedziałek';
    else if(value === 'WT') return 'Wtorek';
    else if(value === 'SR') return 'Środa';
    else if(value === 'CZ') return 'Czwartek';
    else if(value === 'PT') return 'Piątek';
    else if(value === 'SB') return 'Sobota';
    else if(value === 'ND') return 'Niedziela';
    else return "?";
}

function removePlanDay(del){
    if (confirm("Potwierdź usunięcie") === true) {
        document.querySelectorAll(`.list-item[item-id="${del.getAttribute('item-id')}"]`).forEach(function(item){
            item.remove();
        })
    } 
}

window.addEventListener('load', function(){
    const check = document.getElementById('notification');
    const ndow = document.getElementById('not-dow');
    const nhour = document.getElementById('not-hour');
           
    check.addEventListener('change', function(){
        if(check.checked){
            ndow.disabled = false;
            nhour.disabled = false;
        }else{
            ndow.disabled = true;
            nhour.disabled = true;
        }
    })

    
    const form = document.querySelector('#training_day_creator form');
    const dow = document.getElementById('dow');
    const hour = document.getElementById('hour');

    const container = document.getElementById('days-container');
    var nextIndex = 0;
    container.querySelectorAll('.list-item').forEach(function(item){
        try{
            var index = parseInt(item.getAttribute('item-id'));
            if(index >= nextIndex){
                nextIndex = index + 1;
            }
        }catch(err){}        
    })
    form.addEventListener('submit', function(e){
        e.preventDefault();

        const listItem = document.createElement('div');
        listItem.classList.add('list-item');
        listItem.setAttribute('item-id', nextIndex);

        const dowInput = document.createElement('input');
        dowInput.setAttribute('type', 'hidden');
        dowInput.setAttribute('name', `days[${nextIndex}][dow]`);
        dowInput.value = dow.value;
        listItem.appendChild(dowInput);

        const hourInput = document.createElement('input');
        hourInput.setAttribute('type', 'hidden');
        hourInput.setAttribute('name', `days[${nextIndex}][hour]`);
        hourInput.value = hour.value;
        listItem.appendChild(hourInput)

        if(check.checked){
            const ndowInput = document.createElement('input');
            ndowInput.setAttribute('type', 'hidden');
            ndowInput.setAttribute('name', `days[${nextIndex}][ndow]`);
            ndowInput.value = ndow.value;
            listItem.appendChild(ndowInput);

            const nhourInput = document.createElement('input');
            nhourInput.setAttribute('type', 'hidden');
            nhourInput.setAttribute('name', `days[${nextIndex}][nhour]`);
            nhourInput.value = nhour.value;
            listItem.appendChild(nhourInput)
        }

        const listData1 = document.createElement('div');
        listData1.classList.add('list-data');
        const del = document.createElement('span');
        del.classList.add('material-symbols-outlined', 'delete');
        del.setAttribute('item-id', nextIndex);
        del.innerText = 'delete';
        del.addEventListener('click', function(){
            removePlanDay(del);
        })
        listData1.appendChild(del);
        const text1 = document.createElement('span');
        text1.innerText = `${translateDaysOfWeek(dow.value)} ${hour.value}`;
        listData1.appendChild(text1);
        listItem.appendChild(listData1);

        if(check.checked){
            const listData2 = document.createElement('div');
            listData2.classList.add('list-data');
            const noti = document.createElement('span');
            noti.classList.add('material-symbols-outlined');
            noti.innerText = 'notifications';
            listData2.appendChild(noti);
            const text2 = document.createElement('span');
            text2.innerText = `${translateDaysOfWeek(ndow.value)} ${nhour.value}`;
            listData2.appendChild(text2);
            listItem.appendChild(listData2);
        }
        container.appendChild(listItem);
        
        nextIndex++;
        document.getElementById('training_day_creator').classList.add('hidden');
        dow.value = "";
        hour.value = "";
        check.checked = false;
        ndow.value = "";
        nhour.value = "";
    });

    document.querySelectorAll('.delete').forEach(function(del){
        del.addEventListener('click', function(){
            removePlanDay(del);
        })
    })

});