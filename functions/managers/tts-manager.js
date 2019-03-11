const path = require('path');
const fs = require('fs');
const textToSpeech = require('@google-cloud/text-to-speech');

const CONSTANTS = require('../config/constants');

const blurts = require('../language/blurts.json');

/**
 * this class responsibility is to generate blurts audio
 * to be used by the blurts device
 */
class TTSManager {
  /**
   * pass in firebase admin object into constructor
   * this will be used for accessing the storage bucket, and store
   * the blurts audio
   * @param {Object} firebaseAdmin
   */
  constructor(firebaseAdmin) {
    this._ttsClient = new textToSpeech.TextToSpeechClient();

    // get firebase bucket reference
    this._firebaseStorage = firebaseAdmin.storage().bucket();

    this._speechToGenerate = blurts;
  }

  /**
   * this method is used to generate blurts audio and store it into the bucket
   *
   * @param {Object} user     - user detail object
   * @param {Object} managers - we keep all the usable managers i.e. announcements, events, etc. into cache
   *                            so we pass along this object, so that we can re-use it across
   *
   * @return {Promise}
   */
  generateAudioFilesForUser(user, managers) {
    // if there is blurts data for the current user locale, go for it
    // otherwise, fallback to default
    const locale = this._speechToGenerate[user.locale] ? user.locale : 'default';
    console.log('USER');
    console.log(user);
    console.log(locale);

    return Promise.all(Object.keys(this._speechToGenerate[locale]).map((speech) => {
      return new Promise((resolve, reject) => {
        const request = this._constructTTSRequestParams(this._speechToGenerate[locale][speech].replace('{name}', user.name), user.locale);

        const filename = `${user.signal_id}-${speech}.mp3`;

        // Performs the Text-to-Speech request
        this._ttsClient.synthesizeSpeech(request, (err, response) => {
          if (err) {
            console.error('ERROR:', err);
            reject(err);
            return;
          }

          // Write the binary audio content to a local file
          fs.writeFile(`${CONSTANTS.FIREBASE_TMP_FOLDER}/${filename}`, response.audioContent, 'binary', err => {
            if (err) {
              console.error('ERROR:', err);
              reject(err);
              return;
            }
            console.log(`Audio content written to file: ${filename}`);

            this._firebaseStorage.upload(`${CONSTANTS.FIREBASE_TMP_FOLDER}/${filename}`, { destination: `${CONSTANTS.AUDIO_BUCKET_FOLDER}/${filename}` })
              .then((res) => {
                console.log('file uploaded', `${CONSTANTS.FIREBASE_TMP_FOLDER}/${filename}`);
                // Delete the temporary file.
                return new Promise((resolveClean, rejectClean) => {
                  console.log('cleaning temp file', `${CONSTANTS.FIREBASE_TMP_FOLDER}/${filename}`);
                  fs.unlink(`${CONSTANTS.FIREBASE_TMP_FOLDER}/${filename}`, (err) => {
                    if (err) {
                      console.error(`problem in cleaning temp file.`);
                      console.error(err);
                      rejectClean(err);
                    } else {
                      console.log(`temp file cleaned`);
                      resolveClean();
                    }
                  });
                });
              })
              .then((res) => {
                const tmp = {};
                tmp[`${speech}_audio`] = `${CONSTANTS.AUDIO_FILE_BUCKET_URL_PREFIX}${filename}?alt=media`;
                tmp.is_from_sheets = false;

                return managers.users.generalUpdate(user.id, tmp);
              })
              .then((res) => {
                resolve();
                return res;
              })
              .catch((error) => {
                console.log('problem in uploading to bucket');
                reject(error);
              });
          });
        });
      });
    }))
  }

  /**
   * this method is used to construct object parameters to be used in calling Google TTS API
   *
   * @param {String} text - message to be translated to speech
   * @param {String} lang - language locale
   *
   * @return {Object}
   */
  _constructTTSRequestParams(text, lang = CONSTANTS.LANGUAGE_CODE) {
    return {
      input: {
        text
      },
      // Select the language and SSML Voice Gender (optional)
      voice: {
        languageCode: lang,
        ssmlGender: CONSTANTS.SSML_GENDER
      },
      // Select the type of audio encoding
      audioConfig: {
        audioEncoding: 'MP3'
      },
    };
  }
}

module.exports = TTSManager;