window.addEventListener('load', function(){
    document.querySelectorAll('input.date-input').forEach(function(input){
        input.addEventListener('focus', function(){
            input.type = 'date';
        });
        input.addEventListener('focusout', function(){
            if(!input.value){
                input.type = 'text';
            }
        })
    });
});