/**
 *
 *    Copyright (c) 2020 Silicon Labs
 *
 *    Licensed under the Apache License, Version 2.0 (the "License");
 *    you may not use this file except in compliance with the License.
 *    You may obtain a copy of the License at
 *
 *        http://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software
 *    distributed under the License is distributed on an "AS IS" BASIS,
 *    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *    See the License for the specific language governing permissions and
 *    limitations under the License.
 *
 *
 * @jest-environment node
 */

const fs = require('fs')
const axios = require('axios')
const dbApi = require('../src-electron/db/db-api.js')
const queryGeneric = require('../src-electron/db/query-generic.js')
const queryPackage = require('../src-electron/db/query-package.js')
const dbEnum = require('../src-shared/db-enum.js')
const env = require('../src-electron/util/env.js')
const zclLoader = require('../src-electron/zcl/zcl-loader.js')
const args = require('../src-electron/util/args.js')
const httpServer = require('../src-electron/server/http-server.js')
const generationEngine = require('../src-electron/generator/generation-engine.js')

var db
const port = 9074
const baseUrl = `http://localhost:${port}`
const timeout = 5000

beforeAll(() => {
  env.setDevelopmentEnv()
  var file = env.sqliteTestFile('generation')
  return dbApi
    .initDatabaseAndLoadSchema(file, env.schemaFile(), env.zapVersion())
    .then((d) => {
      db = d
      env.logInfo(`Test database initialized: ${file}.`)
    })
    .catch((err) => env.logError(`Error: ${err}`))
}, 5000)

afterAll(() => {
  return httpServer
    .shutdownHttpServer()
    .then(() => dbApi.closeDatabase(db))
    .then(() => {
      var file = env.sqliteTestFile('generation')
      env.logInfo(`Removing test database: ${file}`)
      if (fs.existsSync(file)) fs.unlinkSync(file)
    })
})

describe('Session specific tests', () => {
  test('make sure there is no session at the beginning', () => {
    return queryGeneric.selectCountFrom(db, 'SESSION').then((cnt) => {
      expect(cnt).toBe(0)
    })
  })

  test(
    'Now actually load the static data.',
    () => zclLoader.loadZcl(db, args.zclPropertiesFile),
    timeout
  )

  test(
    'And load the templates.',
    () => generationEngine.loadTemplates(db, args.genTemplateJsonFile),
    3000
  )

  test('http server initialization', () => {
    return httpServer.initHttpServer(db, port)
  })

  var templateCount = 0
  test(
    'test retrieval of all preview template files',
    () => {
      return axios.get(`${baseUrl}/preview/`).then((response) => {
        templateCount = response.data['length']
        for (i = 0; i < response.data['length']; i++) {
          expect(response.data[i]['version']).toBeDefined()
        }
      })
    },
    timeout
  )

  test(
    'Load a second set of templates.',
    () =>
      generationEngine.loadTemplates(
        db,
        './test/gen-template/chip/gen-templates.json'
      ),
    3000
  )

  // Make sure all templates are loaded
  test(
    'Make sure second set of templates are loaded.',
    () =>
      queryPackage
        .getPackagesByType(db, dbEnum.packageType.genSingleTemplate)
        .then((pkgs) => {
          expect(templateCount).toBeLessThan(pkgs.length)
        }),
    3000
  )

  test(
    'test retrieval of all preview template files make sure they are session aware',
    () => {
      return axios.get(`${baseUrl}/preview/`).then((response) => {
        expect(templateCount).toEqual(response.data['length'])
      })
    },
    timeout
  )

  test(
    'test that there is generation data in the simple-test.out preview file. Index 1',
    () => {
      return axios
        .get(`${baseUrl}/preview/simple-test.out/1`)
        .then((response) => {
          expect(response.data['result']).toMatch('Test template file.')
        })
    },
    timeout
  )

  test(
    'No generation test, incorrect file name',
    () => {
      return axios.get(`${baseUrl}/preview/no-file`).then((response) => {
        expect(response.data['result']).toBeUndefined()
      })
    },
    timeout
  )

  test(
    'No generation test, incorrect file name and incorrect index',
    () => {
      return axios.get(`${baseUrl}/preview/no-file/1`).then((response) => {
        expect(response.data['result']).toBeUndefined()
      })
    },
    timeout
  )
})
