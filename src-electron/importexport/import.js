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
 */

/*
 * This file provides the functionality that reads the ZAP data from a JSON file
 * and imports it into a database.
 */
const fs = require('fs')
const env = require('../util/env.js')
const queryConfig = require('../db/query-config.js')
const querySession = require('../db/query-session.js')
const queryPackage = require('../db/query-package.js')
const queryImpexp = require('../db/query-impexp.js')
const dbApi = require('../db/db-api.js')
const dbEnum = require('../../src-shared/db-enum.js')

/**
 * Resolves with a promise that imports session key values.
 *
 * @param {*} db
 * @param {*} sessionId
 * @param {*} keyValuePairs
 */
function importSessionKeyValues(db, sessionId, keyValuePairs) {
  var allQueries = []
  if (keyValuePairs != null) {
    env.logInfo(`Loading ${keyValuePairs.length} key value pairs.`)
    // Write key value pairs
    keyValuePairs.forEach((element) => {
      allQueries.push(
        queryConfig.updateKeyValue(db, sessionId, element.key, element.value)
      )
    })
  }
  return Promise.all(allQueries).then(() => sessionId)
}

// Resolves into a { packageId:, packageType:} object, pkg has `path`, `version`, `type`.
function importSinglePackage(db, sessionId, pkg) {
  return queryPackage
    .getPackageIdByPathAndTypeAndVersion(db, pkg.path, pkg.type, pkg.version)
    .then((pkgId) => {
      if (pkgId != null) {
        return {
          packageId: pkgId,
          packageType: pkg.type,
        }
      } else {
        env.logInfo(
          'Packages from the file did not match loaded packages making best bet.'
        )
        return queryPackage.getPackagesByType(db, pkg.type).then((packages) => {
          packages.forEach((p) => {
            if (p.version == pkg.version) {
              return {
                packageId: p.id,
                packageType: pkg.type,
              }
            }
          })

          if (packages.length > 0) {
            var p = packages[0]
            env.logWarning(
              `Required package did not match the version. Using first found:${p.id}.`
            )
            return {
              packageId: p.id,
              packageType: pkg.type,
            }
          }
          throw `None of the packages found match the required package: ${pkg.path}`
        })
      }
    })
}

// Resolves an array of { packageId:, packageType:} objects into { packageId: id, otherIds: [] }
function convertPackageResult(sessionId, data) {
  var ret = {
    sessionId: sessionId,
    packageId: null,
    otherIds: [],
  }
  data.forEach((obj) => {
    if (obj.packageType == dbEnum.packageType.zclProperties) {
      ret.packageId = obj.packageId
    } else {
      ret.otherIds.push(obj.packageId)
    }
  })
  return ret
}

// Returns a promise that resolves into an object containing: packageId and otherIds
function importPackages(db, sessionId, packages) {
  var allQueries = []
  if (packages != null) {
    env.logInfo(`Loading ${packages.length} packages`)
    packages.forEach((p) => {
      allQueries.push(importSinglePackage(db, sessionId, p))
    })
  }
  return Promise.all(allQueries).then((data) => {
    return convertPackageResult(sessionId, data)
  })
}

function importEndpoints(db, sessionId, endpoints) {
  var allQueries = []
  if (endpoints != null) {
    env.logInfo(`Loading ${endpoints.length} endpoints`)
    endpoints.forEach((endpoint) => {
      allQueries.push(queryImpexp.importEndpoint(db, sessionId, endpoint))
    })
  }
  return Promise.all(allQueries)
}

function importEndpointTypes(
  db,
  sessionId,
  packageId,
  endpointTypes,
  endpoints
) {
  var allQueries = []
  var sortedEndpoints = {}
  if (endpoints != null) {
    endpoints.forEach((ep) => {
      let eptIndex = ep.endpointTypeIndex
      if (sortedEndpoints[eptIndex] == null) sortedEndpoints[eptIndex] = []
      sortedEndpoints[eptIndex].push(ep)
    })
  }

  if (endpointTypes != null) {
    env.logInfo(`Loading ${endpointTypes.length} endpoint types`)
    endpointTypes.forEach((et, index) => {
      allQueries.push(
        queryImpexp
          .importEndpointType(db, sessionId, packageId, et)
          .then((endpointId) => {
            // Now we need to import commands, attributes and clusters.
            var promises = []
            if (sortedEndpoints[index]) {
              sortedEndpoints[index].forEach((endpoint) => {
                promises.push(
                  queryImpexp.importEndpoint(
                    db,
                    sessionId,
                    endpoint,
                    endpointId
                  )
                )
              })
            }
            // et.clusters
            et.clusters.forEach((cluster) => {
              // code, mfgCode, side
              promises.push(
                queryImpexp
                  .importClusterForEndpointType(
                    db,
                    packageId,
                    endpointId,
                    cluster
                  )
                  .then((endpointClusterId) => {
                    var ps = []

                    if ('commands' in cluster)
                      cluster.commands.forEach((command) => {
                        ps.push(
                          queryImpexp.importCommandForEndpointType(
                            db,
                            packageId,
                            endpointId,
                            endpointClusterId,
                            command
                          )
                        )
                      })

                    if ('attributes' in cluster)
                      cluster.attributes.forEach((attribute) => {
                        ps.push(
                          queryImpexp.importAttributeForEndpointType(
                            db,
                            packageId,
                            endpointId,
                            endpointClusterId,
                            attribute
                          )
                        )
                      })
                    return Promise.all(ps)
                  })
              )
            })
            return Promise.all(promises)
          })
      )
    })
  }
  return Promise.all(allQueries)
}

/**
 * Reads the data from the file and resolves with the state object if all is good.
 *
 * @export
 * @param {*} filePath
 * @returns Promise of file reading.
 */
function readDataFromFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, data) => {
      if (err) reject(err)
      let state = JSON.parse(data)
      if (!('featureLevel' in state)) {
        state.featureLevel = 0
      }
      if (state.featureLevel > env.featureLevel) {
        reject(
          `File requires feature level ${state.featureLevel}, we only have ${env.featureLevel}. Please upgrade your zap!`
        )
      } else {
        resolve(state)
      }
    })
  })
}

/**
 * Given a state object, this method returns a promise that resolves
 * with the succesfull writing into the database.
 *
 * @export
 * @param {*} db
 * @param {*} state
 * @returns a promise that resolves into a sessionId that was created.
 */
function writeStateToDatabase(db, state) {
  return dbApi
    .dbBeginTransaction(db)
    .then(() => querySession.createBlankSession(db))
    .then((sessionId) => importPackages(db, sessionId, state.package))
    .then((data) => {
      // data: { sessionId, packageId, otherIds}
      var promisesStage1 = [] // Stage 1 is endpoint types
      var promisesStage2 = [] // Stage 2 is endpoints, which require endpoint types to be loaded prior.
      if ('keyValuePairs' in state) {
        promisesStage1.push(
          importSessionKeyValues(db, data.sessionId, state.keyValuePairs)
        )
      }

      if ('endpointTypes' in state) {
        promisesStage1.push(
          importEndpointTypes(
            db,
            data.sessionId,
            data.packageId,
            state.endpointTypes,
            state.endpoints
          )
        )
      }

      if ('endpoints' in state) {
      }
      return Promise.all(promisesStage1)
        .then(() => Promise.all(promisesStage2))
        .then(() => data.sessionId)
    })
    .finally(() => dbApi.dbCommit(db))
}

/**
 * Writes the data from the file into a new session.
 *
 * @export
 * @param {*} db
 * @param {*} filePath
 * @returns a promise that resolves with the session Id of the written data.
 */
function importDataFromFile(db, filePath) {
  return readDataFromFile(filePath).then((state) =>
    writeStateToDatabase(db, state)
  )
}
// exports
exports.readDataFromFile = readDataFromFile
exports.importDataFromFile = importDataFromFile
