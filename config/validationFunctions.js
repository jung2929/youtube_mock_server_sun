class validation{
    isValidePageIndex(page){
        let isValide = true;
        if (!Number.isInteger(Number(page))) {
            isValide = false;
        }
        else if (Number(page) === 0 ){
            isValide = false;
        }
        return isValide;
    }
}



module.exports = {
    validation
}
