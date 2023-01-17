

window.addEventListener('load', function(){
    HTMLElement.prototype.getElementsByAttr = function(attr){
        return document.querySelectorAll('['+attr+']');

    };
    Document.prototype.getElementsByAttr = function(attr){
        return document.querySelectorAll('['+attr+']'); 
    };
    

    document.getElementsByAttr('ajax-form').forEach(function(form){
        form.addEventListener('submit', function(e){
            e.preventDefault();
            var data = new FormData(form)
            form.getElementsByAttr('form-submit').forEach(function(submit){
                submit.disabled = true;
            });
            fetch(location.pathname, {
                method: 'POST',
                body: data
            }).then(function(response){
                return response.json();
            }).then(function(json){
                const keys = Object.keys(json);
                console.log(keys);
                if(keys.includes('error')){
                    throw json.error;
                }else{
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
});