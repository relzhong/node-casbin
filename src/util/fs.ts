import * as fs from 'fs';

// readFile return a promise for readFile.
function readFile(path: string, encoding?: string): any {
  return new Promise((resolve, reject) => {
    fs.readFile(path, encoding || 'utf8', (error, data) => {
      if (error) {
        reject(error);
      }
      resolve(data);
    });
  });
}

// writeFile return a promise for writeFile.
function writeFile(path: string, file: string, encoding?: string): any {
  return new Promise((resolve, reject) => {
    fs.writeFile(path, file, encoding || 'utf8', (error) => {
      if (error) {
        reject(error);
      }
      resolve(true);
    });
  });
}

export {
  readFile,
  writeFile,
};
