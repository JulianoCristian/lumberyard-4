// Copyright (c) 2017 The Regents of the University of Michigan.
// All Rights Reserved. Licensed according to the terms of the Revised
// BSD License. See LICENSE.txt for details.

const FileTreeInspector = require("../lib/file-tree-inspector");
const crypto = require("crypto");
const fs = require("fs");

const later = require("../spec/helpers/later")(it);

let inspector = null;

let md5sum = data => {
  return crypto.createHash("md5").update(data).digest("latin1");
};

let writeFile = (path, data) => new Promise(function(resolve, reject) {
  fs.writeFile(path, data, handleErr(path, resolve, reject));
});

let rm = path => new Promise(function(resolve, reject) {
  fs.unlink(path, handleErr(path, resolve, reject));
});

let mkdir = path => new Promise(function(resolve, reject) {
  fs.mkdir(path, handleErr(path, resolve, reject));
});

let rmdir = path => new Promise(function(resolve, reject) {
  fs.rmdir(path, handleErr(path, resolve, reject));
});

let handleErr = (output, resolve, reject) => function(err) {
  if (err)
    reject(err);
  else
    resolve(output);
};

describe("an instance of FileTreeInspector()", () => {
  beforeEach(() => {
    inspector = FileTreeInspector();
  });

  describe("given a tree of files and directories", () => {
    // ./fstest/
    // |-- subdir/
    // |   |-- a.txt
    // |   |-- b.txt
    // |   \-- c.txt
    // |-- a.txt
    // \-- b.txt
    beforeEach(done => {
      let reject = err => {
        expect(err).toBe("not an error");
        done();
      };

      mkdir("fstest").then(() => {
        let files = [];

        files.push(writeFile("fstest/a.txt", "Hey there"));
        files.push(writeFile("fstest/b.txt", "Sup Matt"));
        files.push(mkdir("fstest/subdir"));

        Promise.all(files).then(() => {
          let subfiles = [];

          subfiles.push(writeFile("fstest/subdir/a.txt", "AAAAA"));
          subfiles.push(writeFile("fstest/subdir/b.txt", "BbBbB"));
          subfiles.push(writeFile("fstest/subdir/c.txt", "The Sea"));

          Promise.all(subfiles).then(() => {
            done();

          }, reject);
        }, reject);
      }, reject);
    });

    afterEach(done => {
      let reject = err => {
        expect(err).toBe("not an error");
        done();
      };

      let subfiles = [];

      subfiles.push(rm("fstest/subdir/a.txt"));
      subfiles.push(rm("fstest/subdir/b.txt"));
      subfiles.push(rm("fstest/subdir/c.txt"));

      Promise.all(subfiles).then(() => {
        let files = [];

        files.push(rm("fstest/a.txt"));
        files.push(rm("fstest/b.txt"));
        files.push(rmdir("fstest/subdir"));

        Promise.all(files).then(() => {
          rmdir("fstest").then(() => {
            done();

          }, reject);
        }, reject);
      }, reject);
    });

    later.it("can find a.txt",
      () => inspector.getSizesUnder("fstest"), value => {
        expect(value.get("fstest/a.txt")).toBe(9);
      });

    later.it("can find b.txt",
      () => inspector.getSizesUnder("fstest"), value => {
        expect(value.get("fstest/b.txt")).toBe(8);
      });

    later.it("can find subdir/a.txt",
      () => inspector.getSizesUnder("fstest"), value => {
        expect(value.get("fstest/subdir/a.txt")).toBe(5);
      });

    later.it("can find subdir/c.txt",
      () => inspector.getSizesUnder("fstest"), value => {
        expect(value.get("fstest/subdir/c.txt")).toBe(7);
      });

    later.it("gives the right checksum for a.txt",
      () => inspector.getChecksum("fstest/a.txt"), value => {
        expect(value).toBe(md5sum("Hey there"));
      });

    later.itErrors("when told to checksum a nonexistent file",
      () => inspector.getChecksum("fstest/not-a-file.txt"))

    later.it("yields an empty size mapping for nonexistent paths",
      () => inspector.getSizesUnder("fstest/not-a-dir"), value => {
        expect(value.size).toBe(0);
      });

    later.it("doesn't look at files not under the requested path",
      () => inspector.getSizesUnder("fstest/subdir"), value => {
        expect(value.has("fstest/a.txt")).toBe(false);
      });
  });
});