class validation{
    isValidePageIndex(page){
        let isValid = true;
        if (!Number.isInteger(Number(page))) {
            isValid = false;
        }
        else if (Number(page) === 0 ){
            isValid = false;
        }
        else if(!page){
            isValid = false;
        }
        return isValid;
    }
}



module.exports = {
    validation
}
