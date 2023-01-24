

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
            var options = {
                method: 'POST'
            }
            if(form.enctype === "multipart/form-data"){
                options.body = data;
            }else{
                var json = {};
                for(const key of data.keys()){
                    json[key] = data.get(key);
                }
                options.body = JSON.stringify(json);
                options['headers'] = {
                    'Content-Type': 'application/json'
                }
            }
            form.getElementsByAttr('form-submit').forEach(function(submit){
                submit.disabled = true;
            });
            fetch(form.action, options).then(function(response){
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
            equipC.querySelector('[name="name"]').value = "";
            equipC.querySelector('[name="type"][value="y"]').checked = true;
            equipC.querySelector('[name="type"][value="n"]').checked = false;
            equipC.querySelector('[name="photo"]').value = "";
        }
    }

    const exC = document.querySelector('#ex_creator form:first-child');
    if(exC){
        exC.onAdd = function(e){
            const row = document.getElementById('training-exercises');
            if(row){
                const child = document.createElement('div');
                child.classList.add('col-2', 'panel');
                child.innerHTML = `
                <input class="form-check-input d-none" type="checkbox" name="ex-${encodeURI(e.name)}" id="${encodeURI(e.name)}">
                <label class="form-check-label" for="${encodeURI(e.name)}">
                    <div class="selected"></div>
                    <p class="ex-name">${e.name}</p>
                </label>
                `;
                row.appendChild(child);
                document.getElementById('ex_creator').classList.add('hidden');
            }
            exC.querySelector('[name="name"]').value = "";
            exC.querySelector('[name="type"][value="y"]').checked = false;
            exC.querySelector('[name="type"][value="n"]').checked = true; 
            exC.querySelector('[name="video"]').value = "";
            exC.querySelectorAll('[name^="equipment-"]').forEach(function(item){
                item.checked = false;
            })
        }
    }

    const trainingMode = document.querySelector('#training-mode-form');
    if(trainingMode){
        function func(e){
            e.preventDefault();
            return e.returnValue = 'Czy na pewno chcesz opuścić tą stronę? Masz niezapisane zmiany.';
        }
        window.addEventListener('beforeunload', func);

        trainingMode.onAdd = function(e){
            window.removeEventListener('beforeunload', func);
            location.href = '/done/trening';
        }
        
    }

    const addVideo = document.querySelector('#add-video-form');
    if(addVideo){
        addVideo.onAdd = function(e){
            const parent = addVideo.parentNode;
            parent.innerHTML = `
            <video controls>
                <source src="/files/exercises/${addVideo.querySelector('input[name=\'name\']').value}.mp4" type="video/mp4">
            </video>`
        }
    }

    const addPhoto = document.querySelector('#add-photo-form');
    if(addPhoto){
        addPhoto.onAdd = function(e){
            const parent = addPhoto.parentNode;
            parent.innerHTML = `<img src="/files/equipment/${addPhoto.querySelector('input[name=\'name\']').value}.png">`
        }
    }
});