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

const bin = require('../src-electron/util/bin.js')

test('32-bit hex conversions', () => {
  var xN = 0x1234abcd
  expect(bin.int32ToHex(xN)).toEqual('1234ABCD')
  expect(bin.int32ToHex(xN, true)).toEqual('CDAB3412')
})

test('16-bit hex conversions', () => {
  var xN = 0xabcd
  expect(bin.int16ToHex(xN)).toEqual('ABCD')
  expect(bin.int16ToHex(xN, true)).toEqual('CDAB')
})

test('8-bit hex conversions', () => {
  var xN = 0xab
  expect(bin.int8ToHex(xN)).toEqual('AB')
  expect(bin.int8ToHex(xN, true)).toEqual('AB')
})

test('Hex to bytes conversions', () => {
  expect(bin.hexToCBytes('1234abcd')).toEqual('0x12, 0x34, 0xAB, 0xCD')
})

test('String hex conversions', () => {
  var xN = 'abcdABCD'
  var xS = bin.stringToHex(xN)
  expect(xS).toEqual('616263644142434400')
  expect(bin.hexToCBytes(xS)).toEqual(
    '0x61, 0x62, 0x63, 0x64, 0x41, 0x42, 0x43, 0x44, 0x00'
  )
})

test('Hex to binary', () => {
  var hex = bin.int32ToHex(1234)
  expect(hex).toBe('000004D2')
  expect(bin.hexToBinary(hex)).toBe('00000000000000000000010011010010')
  expect(bin.hexToBinary('0xABCD')).toBe('1010101111001101')
  expect(bin.hexToBinary('0XABCD')).toBe('1010101111001101')
  expect(bin.hexToBinary('AbCd')).toBe('1010101111001101')
  expect(bin.hexToBinary('abcd')).toBe('1010101111001101')
  expect(bin.hexToBinary('ABCD')).toBe('1010101111001101')
  expect(bin.hexToBinary('AB CD')).toBe('1010101111001101')
})

test('Bit offset', () => {
  expect(bin.bitOffset('010')).toBe(1)
  expect(bin.bitOffset('011')).toBe(0)
  expect(bin.bitOffset(bin.hexToBinary(bin.int8ToHex(2)))).toBe(1)
  expect(bin.bitOffset(bin.hexToBinary(bin.int8ToHex(4)))).toBe(2)
})
