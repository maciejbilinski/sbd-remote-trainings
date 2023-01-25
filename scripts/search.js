window.addEventListener('load', function() {
    const searchBox = document.querySelector('#search-box');

    searchBox.addEventListener('input', function () {
        let searchQuery = searchBox.value.toUpperCase();

        document.querySelectorAll('.td-name').forEach(function(td_name) {
            if (td_name.textContent.toUpperCase().includes(searchQuery)) {
                if (td_name.parentElement != undefined) {
                    td_name.parentElement.style.display = 'table-row';
                }
            } else {
                if (td_name.parentElement != undefined) {
                    td_name.parentElement.style.display = 'none';
                }
            }
        });
    });
});
