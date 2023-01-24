window.addEventListener('load', function(){
    document.querySelectorAll('.add-series').forEach(function(btn){
        btn.addEventListener('click', function(e){
            e.preventDefault();
            const parent = btn.parentNode;
            const prev = parent.querySelector('details:last-of-type');
            var n = 1;
            if(prev){
                if(!prev.finished){
                    alert('Zakończ najpierw poprzednią serię!');
                    return;
                }
                n = parseInt(prev.getAttribute('n'))+1;
            }
            const details = document.createElement('details');
            details.open = true;
            details.setAttribute('n', n);
            const summary = document.createElement('summary');
            summary.innerText = "Seria " + n;
            details.appendChild(summary);
            const detailsContent = document.createElement('div');
            detailsContent.classList.add('details-content', 'series');
            const ex = decodeURI(btn.getAttribute('ex'));
            var exercise;
            for(const exer of exercisesData){
                if(exer.nazwa === ex){
                    exercise = exer;
                    break;
                }
            }
            console.log(exercise); 
            const finishBtn = document.createElement('button');
            var stopBtn;
            if(exercise.czy_powtorzeniowe === 'T'){
                const input = document.createElement('input');
                const lbl = document.createElement('label');
                input.type = 'number';
                lbl.innerText = 'Ilość powtórzeń';
                input.min = 0;
                input.required = true;
                input.name = `exercises+${btn.getAttribute('ex')}+${n}+amount`;
                detailsContent.appendChild(lbl);
                detailsContent.appendChild(input);
            }else{
                stopBtn = document.createElement('button');
                const timer = document.createElement('div');
                timer.classList.add('timer');
                const timerTitle = document.createElement('span');
                timerTitle.innerText = "Licznik czasu: "
                timer.appendChild(timerTitle);
                const timerText = document.createElement('span');
                timerText.innerText = 0;
                timer.appendChild(timerText);
                timerText.time = 0;
                const timerInput = document.createElement('input');
                timerInput.name = `exercises+${btn.getAttribute('ex')}+${n}+time`;
                timerInput.style.width = 0;
                timerInput.style.opacity = 0;
                timerInput.style.float = 'left';
                timerInput.required = true;
                timer.appendChild(timerInput);

                stopBtn.timer = setInterval(function(){
                    timerText.time++;
                    timerText.innerText = timerText.time;
                }, 1000);
                stopBtn.classList.add('btn', 'btn-primary');
                stopBtn.innerText = "Zatrzymaj czas"
                stopBtn.type = 'button';
                stopBtn.addEventListener('click', function(){
                    clearInterval(stopBtn.timer);
                    timerInput.value = timerText.time;
                    detailsContent.removeChild(stopBtn);
                })
                detailsContent.appendChild(timer);
                detailsContent.appendChild(stopBtn);
            }
            finishBtn.classList.add('btn', 'btn-primary');
            finishBtn.innerText = "Zakończ serię"
            finishBtn.type = 'button';
            finishBtn.addEventListener('click', function(){
                if(stopBtn) stopBtn.click();
                detailsContent.removeChild(finishBtn);
                details.finished = true;
            })
            if(exercise.sprzet){
                for(const equip of exercise.sprzet){
                    if(equip.czy_rozne_obciazenie === "T"){
                        const str = 'Obciążenie ' + equip.nazwa.toLowerCase() + ' ' + (inKG ? '[kg]' : '[lbs]');
                        const lbl = document.createElement('label');
                        lbl.innerText = str;
                        const eqInput = document.createElement('input');
                        eqInput.type = 'number';
                        eqInput.min = 0;
                        eqInput.required = true;
                        eqInput.name = `exercises+${btn.getAttribute('ex')}+${n}+weight+${encodeURI(equip.nazwa)}`;

                        detailsContent.appendChild(lbl);
                        detailsContent.appendChild(eqInput);
                    }
                }
            }
            detailsContent.appendChild(finishBtn);
            details.finished = false;
            details.appendChild(detailsContent);
            parent.appendChild(details);
        });
    })
})