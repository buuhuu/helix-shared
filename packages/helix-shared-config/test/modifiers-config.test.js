/*
 * Copyright 2021 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/* eslint-disable no-console */

/* eslint-env mocha */
const assert = require('assert');
const path = require('path');
const { readFile } = require('fs').promises;
const { ModifiersConfig } = require('../src/index.js');

async function readTestJSON(filename) {
  return JSON.parse(await readFile(path.resolve(__dirname, 'fixtures', 'content', filename), 'utf-8'));
}

function delta(t0, t1) {
  const s = t1[0] - t0[0];
  const ns = t1[1] - t0[1];
  return s * 1000 + (ns / 1000000);
}

function bench(testData, json) {
  let totalParse = 0;
  let totalFilter = 0;
  let totalCreate = 0;
  const numIter = 10;
  for (let i = 0; i < numIter; i += 1) {
    const t0 = process.hrtime();
    const data = JSON.parse(json);
    const t1 = process.hrtime();
    const mod = ModifiersConfig.fromModifierSheet(data);
    const t2 = process.hrtime();
    mod.getModifiers('/adobe/announcement/graduation');
    const t3 = process.hrtime();
    totalParse += delta(t0, t1);
    totalCreate += delta(t1, t2);
    totalFilter += delta(t2, t3);
  }
  console.log('json size: ', json.length);
  console.log('data size: ', testData.length);
  console.log('parse: ', totalParse / numIter);
  console.log('create: ', totalCreate / numIter);
  console.log('filter: ', totalFilter / numIter);
}

describe('ModifiersConfig', () => {
  it('filters large metadata no glob', async () => {
    const testData = [];
    for (let i = 0; i < 10000; i += 1) {
      testData.push({
        URL: `/url${i}`.repeat(10),
        title: `Title Nr. ${i}`,
        category: `Category Nr. ${i}`,
        Description: `Description Nr. ${i}`,
      });
    }
    const json = JSON.stringify(testData);
    bench(testData, json);
  });

  it('filters large metadata all glob', async () => {
    const testData = [];
    for (let i = 0; i < 10000; i += 1) {
      testData.push({
        URL: `${`/url${i}`.repeat(4)}/*`,
        title: `Title Nr. ${i}`,
        category: `Category Nr. ${i}`,
        Description: `Description Nr. ${i}`,
      });
    }
    const json = JSON.stringify(testData);
    bench(testData, json);
  });

  it('filters large metadata all match', async () => {
    const testData = [];
    for (let i = 0; i < 10000; i += 1) {
      testData.push({
        URL: '/adobe/announcement/graduation',
        title: `Title Nr. ${i}`,
        category: `Category Nr. ${i}`,
        Description: `Description Nr. ${i}`,
      });
    }
    const json = JSON.stringify(testData);
    bench(testData, json);
  });

  it('it matches sub-pages metadata', async () => {
    const { default: { data } } = await readTestJSON('metadata.json');
    const actual = ModifiersConfig.fromModifierSheet(data).getModifiers('/page-whatever.html');
    assert.deepStrictEqual(actual, {
      category: 'rendering-test',
    });
  });

  it('it can parse kv-pairs', async () => {
    const { default: { data } } = await readTestJSON('metadata-kv.json');
    const actual = ModifiersConfig.fromModifierSheet(data).getModifiers('/page-whatever.html');
    assert.deepStrictEqual(actual, {
      description: 'Lorem ipsum dolor sit amet.',
      keywords: 'ACME, CORP, PR',
      title: 'ACME CORP',
    });
  });

  it('it can filter keys on parsing', async () => {
    const { default: { data } } = await readTestJSON('metadata-kv.json');
    const filter = (name) => name !== 'title';
    const actual = ModifiersConfig.fromModifierSheet(data, filter).getModifiers('/page-whatever.html');
    assert.deepStrictEqual(actual, {
      description: 'Lorem ipsum dolor sit amet.',
      keywords: 'ACME, CORP, PR',
    });
  });

  it('it can filter keys on construction', async () => {
    const { default: { data } } = await readTestJSON('metadata-kv.json');
    const filter = (name) => name !== 'title';
    const map = ModifiersConfig.parseModifierSheet(data);
    const actual = new ModifiersConfig(map, filter).getModifiers('/page-whatever.html');
    assert.deepStrictEqual(actual, {
      description: 'Lorem ipsum dolor sit amet.',
      keywords: 'ACME, CORP, PR',
    });
  });

  it('it deal with empty map', async () => {
    const actual = new ModifiersConfig().getModifiers('/');
    assert.deepStrictEqual(actual, {});
  });

  it('it combines metadata', async () => {
    const { default: { data } } = await readTestJSON('metadata.json');
    const actual = ModifiersConfig.fromModifierSheet(data).getModifiers('/page-metadata-json.html');
    assert.deepStrictEqual(actual, {
      'og:publisher': 'Adobe',
      category: 'rendering-test',
      image: '/media_cf867e391c0b433ec3d416c979aafa1f8e4aae9c.png',
      keywords: 'Baz, Bar, Foo',
    });
  });

  it('it matches exactly', async () => {
    const { default: { data } } = await readTestJSON('metadata.json');
    const actual = ModifiersConfig.fromModifierSheet(data).getModifiers('/exact-match.html');
    assert.deepStrictEqual(actual, {
      'og:publisher': 'Adobe',
      keywords: 'Exactomento',
      'short-title': 'E',
    });
  });

  it('it matches exact folder', async () => {
    const { default: { data } } = await readTestJSON('metadata.json');
    const actual = ModifiersConfig.fromModifierSheet(data).getModifiers('/exact-folder/');
    assert.deepStrictEqual(actual, {
      'og:publisher': 'Adobe',
      keywords: 'Exactomento Folder',
      'short-title': 'E',
    });
  });

  it('it doesnt matches below exact folder', async () => {
    const { default: { data } } = await readTestJSON('metadata.json');
    const actual = ModifiersConfig.fromModifierSheet(data).getModifiers('/exact-folder/subpage');
    assert.deepStrictEqual(actual, {});
  });

  it('it matches nothing', async () => {
    const { default: { data } } = await readTestJSON('metadata.json');
    const actual = ModifiersConfig.fromModifierSheet(data).getModifiers('/nope');
    assert.deepStrictEqual(actual, {});
  });
});
