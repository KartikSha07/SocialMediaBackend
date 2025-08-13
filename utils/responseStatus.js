const success = function(statusCode,message) {
    return {
        status: "ok",
        statusCode,
        result : message,
    }
}

const failure = function(statusCode,message) {
    return {
        status: "error",
        statusCode,
        message: message,
    }
}

module.exports = {
    success,
    failure,
}