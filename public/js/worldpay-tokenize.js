function IntegraPayIsValidApiToken(value) {

    if (/^([a-zA-Z0-9\-]{30,100})$/.test(value))
        return true;
    else
        return false;
}

function IntegraPayIsValidCardNumber(value) {
    if (/[^0-9]+/.test(value)) return false;

    if (value.length < 13 || value.length > 16) return false;

    var nCheck = 0, nDigit = 0, bEven = false;
    value = value.replace(/\D/g, "");

    for (var n = value.length - 1; n >= 0; n--) {
        var cDigit = value.charAt(n),
            nDigit = parseInt(cDigit, 10);

        if (bEven) {
            if ((nDigit *= 2) > 9) nDigit -= 9;
        }

        nCheck += nDigit;
        bEven = !bEven;
    }

    return (nCheck % 10) == 0;
}

function IntegraPayIsValidCardName(value) {
    if (/^([a-zA-Z0-9 '\-\.]{3,30})$/.test(value))
        return true;
    else
        return false;
}

function IntegraPayIsValidCardCcv(value) {
    if (/^(\d{3,4})$/.test(value))
        return true;
    else
        return false;
}

function IntegraPayIsValidCardExpiryYear(value) {
    if (/^(\d{4})$/.test(value))
        return true;
    else
        return false;
}

function IntegraPayIsValidCardExpiryMonth(value) {

    if (/^(\d{2})$/.test(value))
        return true;
    else
        return false;
}


function IntegraPayProcessPayment() {
    var form = $('form[data-integrapay="PaymentForm"]');
    var errorsDiv = $('div[data-integrapay="Errors"]');
    var processingDiv = $('div[data-integrapay="Processing"]');
    var btn = $('button[data-integrapay="SubmitButton"]');

    processingDiv.html("");
    errorsDiv.text("");
    errorsDiv.attr('id', "integrapay-ed");

    var businessKey = $('input[data-integrapay="BusinessKey"]').val();
    var cardName = $('input[data-integrapay="CardName"]').val();
    var cardNumber = $('input[data-integrapay="CardNumber"]').val();
    var cardCcv = $('input[data-integrapay="CardCcv"]').val();
    var cardExpiryMonth = $('select[data-integrapay="CardExpiryMonth"] option:selected').val();
    var cardExpiryYear = $('select[data-integrapay="CardExpiryYear"] option:selected').val();
    var deviceData = $('input[id="device_data"]').val();

    var cardDetails = {
        "CardholderName": cardName,
        "CardNumber": cardNumber,
        "ExpiryMonth": cardExpiryMonth,
        "ExpiryYear": cardExpiryYear,
        "Ccv": cardCcv
    };

    var tokenizeRequest = {
        "Card": cardDetails,
        "DeviceData": deviceData
    }

    if (!IntegraPayIsValidApiToken(businessKey)) {
        errorsDiv.text("Invalid businessKey");
        return;
    }
    if (!IntegraPayIsValidCardNumber(cardNumber)) {
        errorsDiv.text("Invalid card number entered");
        return;
    }
    if (!IntegraPayIsValidCardName(cardName)) {
        errorsDiv.text("Invalid cardholder name entered (please enter letters and numbers only)");
        return;
    }
    if (!IntegraPayIsValidCardCcv(cardCcv)) {
        errorsDiv.text("Invalid card CCV entered");
        return;
    }
    if (!IntegraPayIsValidCardExpiryMonth(cardExpiryMonth)) {
        errorsDiv.text("Invalid expiry month selected");
        return;
    }
    if (!IntegraPayIsValidCardExpiryYear(cardExpiryYear)) {
        errorsDiv.text("Invalid expiry year selected");
        return;
    }

    var expiryDate = new Date(cardExpiryYear, cardExpiryMonth - 1, 1);
    var dateCheck = new Date();
    dateCheck = new Date(dateCheck.getFullYear(), dateCheck.getMonth(), 1);
    if (expiryDate < dateCheck) {
        errorsDiv.text("Credit card is expired");
        return;
    }

    btn.prop('disabled', true);
    processingDiv.html("<img src=\"https://sandbox.rest.paymentsapi.io/images/processing.gif\">");

    var apiUrl = "https://sandbox.rest.paymentsapi.io/businesses/" + businessKey + "/services/tokenize-card";

    $.ajax({
        url: apiUrl,
        type: "POST",
        async: true,
        crossDomain: true,
        data: JSON.stringify(tokenizeRequest),
        dataType: "JSON",
        contentType: "application/json",
        success: function (dataSuccess) {
            var cardToken = dataSuccess.token;
            $('input[data-integrapay="CardNumber"]').val('');
            $('input[data-integrapay="CardCcv"]').val('');
            $('input[data-integrapay="CardToken"]').val(cardToken);
            cardDetails = null;
            tokenizeRequest = null;
            // form.submit();
            if (typeof $(document).trigger === 'function') {
                $(document).trigger('worldpayTokenReady', [{ token: cardToken }]);
            }

        },
        error: function (dataFail) {
            var errorType = dataFail.ErrorCode;
            var errorMessage = dataFail.ErrorMessage;

            processingDiv.html("");
            errorsDiv.text("Service currently unavailable - sorry we were not able to process your payment");
            btn.prop('disabled', false);
        }
    });

}

// Wait for elements to be available in DOM (for React)
function initWorldpay() {
    var processButton = $('button[data-integrapay="SubmitButton"]');

    // Only attach if not already attached
    if (processButton.length && !processButton.hasClass('worldpay-initialized')) {
        processButton.addClass('worldpay-initialized');
        processButton.off('click').click(function (e) {
            IntegraPayProcessPayment();
        });
        console.log("Worldpay attached to button");
    } else if (!processButton.length) {
        // Elements not ready yet, try again
        setTimeout(initWorldpay, 500);
    }
}

// Run initialization when DOM is ready and keep trying for React
$(document).ready(function () {
    var formIdCheck = $('form[data-integrapay="PaymentForm"]').attr('id');
    if (formIdCheck == null || formIdCheck == '') {
        $('form[data-integrapay="PaymentForm"]').attr('id', "PaymentForm");
    }

    // Start looking for React-rendered elements
    initWorldpay();
});






