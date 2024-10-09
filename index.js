const ocr = require("./src/utils/ocr");
const { createPDF } = require("./src/utils/pdf");
const { translate } = require("./src/utils/translate");

(async () => {
    try {
        const text = await ocr.image2text("./data/sample.png");
        console.log(text);
        const viText = await translate(text);
        console.log(viText);
        const pdfFile = createPDF(viText);
        console.log("This is PDF file: " + pdfFile)
    } catch (e) {
        console.log(e);
    }
})();
