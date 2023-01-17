window.addEventListener('load', function(){
    const btn = document.getElementById('cockpit-btn');
    if(btn){
        btn.addEventListener('click', function(){
            location.href = "/";
        });
    }
});