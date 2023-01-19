window.addEventListener('load', function(){
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
});