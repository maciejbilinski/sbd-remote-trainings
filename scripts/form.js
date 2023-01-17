

window.addEventListener('load', function(){
    HTMLElement.prototype.getElementsByAttr = function(attr){
        return this.querySelectorAll('['+attr+']');

    };
    Document.prototype.getElementsByAttr = function(attr){
        return this.querySelectorAll('['+attr+']'); 
    };
    

    document.getElementsByAttr('ajax-form').forEach(function(form){
        form.addEventListener('submit', function(e){
            e.preventDefault();
            var data = new FormData(form)
            form.getElementsByAttr('form-submit').forEach(function(submit){
                submit.disabled = true;
            });
            fetch(form.action, {
                method: 'POST',
                body: data
            }).then(function(response){
                return response.json();
            }).then(function(json){
                const keys = Object.keys(json);
                if(keys.includes('error')){
                    throw json.error;
                }else{
                    if(form.onAdd !== undefined){
                        form.onAdd(json.data);
                    }else
                        location.href = '/created/' + form.getAttribute("form-redirect");
                }
            }).catch(function(err){
                form.getElementsByAttr('form-error').forEach(function(error){
                    error.innerText = err;
                });
            }).finally(function(){
                form.getElementsByAttr('form-submit').forEach(function(submit){
                    submit.disabled = false;
                });
            })
        });
    });

    document.querySelectorAll('.subform').forEach(function(subform){
        subform.querySelectorAll('.close').forEach(function(close){
            close.addEventListener('click', function(){
                subform.classList.add('hidden');
            })
        })
    })

    document.querySelectorAll('.add-circle').forEach(function(element){
        element.addEventListener('click', function(){
            document.getElementById(element.getAttribute('subform-id')).classList.remove('hidden');
        })
    })

    const equipC = document.querySelector('#equip_creator form:first-child');
    if(equipC){
        equipC.onAdd = function(e){
            const row = document.getElementById('exercise-equipment');
            if(row){
                const child = document.createElement('div');
                child.classList.add('col-2', 'panel');
                child.innerHTML = `
                <input class="form-check-input d-none" type="checkbox" name="equipment-${encodeURI(e.name)}" id="${encodeURI(e.name)}">
                <label class="form-check-label" for="${encodeURI(e.name)}">
                    <div class="selected"></div>
                    ${e.photo === 'T' ? `<img src="/files/equipment/${e.name}.png" onerror="this.style.display='none';">` : ''}
                    <p class="equip-name">${e.name}</p>
                </label>
                `;
                row.appendChild(child);
                document.getElementById('equip_creator').classList.add('hidden');
            }
        }
    }
});