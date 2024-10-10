const tesseract = require("node-tesseract-ocr")

/**
 * OCR image to text
 * @param {string|Buffer} img Path or Buffer
 * @returns {Promise<string>} Result text
 */
async function image2text(img){
  return await tesseract.recognize(img, {
    lang: "eng"
  })
}

module.exports = {
  image2text
}

