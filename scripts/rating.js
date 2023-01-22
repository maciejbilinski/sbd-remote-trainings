window.addEventListener('load', function(){
    document.querySelectorAll('.star').forEach(function(star){
        star.n = parseInt(star.getAttribute('n'));
        star.addEventListener('mouseover', function(){
            if(star.classList.contains('clicked')){
                document.querySelectorAll('.star').forEach(function(e){
                    if(e.n > star.n){
                        if(e.classList.contains('clicked')){
                            e.classList.add('hover');
                        }
                    }
                })
            }else{
                star.classList.add('hover');
                document.querySelectorAll('.star').forEach(function(e){
                    if(e.n < star.n){
                        if(!e.classList.contains('clicked'))
                            e.classList.add('hover');
                    }
                })
            }
        })
        star.addEventListener('mouseleave', function(){
            if(star.classList.contains('clicked')){
                document.querySelectorAll('.star').forEach(function(e){
                    if(e.n > star.n){
                        if(e.classList.contains('hover')){
                            e.classList.remove('hover');
                        }
                    }
                })
            }else{
                star.classList.remove('hover');
                document.querySelectorAll('.star').forEach(function(e){
                    if(e.n < star.n){
                        if(!e.classList.contains('clicked'))
                            e.classList.remove('hover');
                    }
                })    
            }
        })
        star.addEventListener('click', function(){
            document.querySelectorAll('.star').forEach(function(e){
                e.classList.remove('clicked');
                e.classList.remove('hover');
                if(e.n < star.n){
                    e.classList.add('clicked');
                }
            })     
            star.classList.add('clicked');
            document.getElementById('rating').value = star.n;
        })
    })
})