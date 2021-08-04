'use strict'

if(process.argv.length == 2) {
  console.log('maxGraph chat diagram to Resolvd sql converter')
  console.log('Usage: node index.js [xml file to convert] [optional starting row id]')
  process.exit()
}

const FILENAME = process.argv[2]
const START_ID = process.argv[3] ? process.argv[3] : 0

const parser = require('fast-xml-parser')
const fs = require('fs')
const he = require('he')
const textVersion = require('textversionjs')

// Utilities
const remove_attr = props => cell => {
  for (const prop of props)
    delete cell[prop]
  return cell
}

const props = cell => Object.getOwnPropertyNames(cell)

const not_basically_empty = cell => !(props(cell).length == 1 && props(cell)[0] == '@_id')

const value_to_text = cell => {
  if(cell['@_value'])
    cell['@_value'] = textVersion(he.decode(cell['@_value']))
  return cell
}

const vertices = cell => cell['@_vertex'] == 1

const edges = cell => cell['@_edge'] == 1

// keep only what we need, and remove final line break from contents
const prune = cell => ({
  id: parseInt(cell['@_id']),
  contents: cell['@_value'].trim()
})

const to_from = cell => ({
  from: parseInt(cell['@_source']),
  to: parseInt(cell['@_target'])
})

const find_row = (rows, id) => rows.find(row => row.id == id)

const link_up = (rows, links) => {
  links.forEach(link => {
    const row = find_row(rows, link.from)
    row.to ? row.to.push(link.to) : row.to = [link.to]
  })
  return rows
}

const renumber = (rows, start_id = 0) => {
  rows.forEach(row => row.new_id = start_id++)
  rows.forEach(row => {
    if(row.to)
      row.to = row.to.map(t => t = find_row(rows, t).new_id)
  })
  rows.forEach(row => {
    row.id = row.new_id
    delete row.new_id
  })
  return rows
}

const collapse_buttons = rows => {
  const row_ids_to_delete = []
  rows_linked.forEach(row => {
    if(row.to && row.to.length == 1) {
      const target_row = find_row(rows, row.to[0])
      row.name = row.contents
      row.contents = target_row.contents
      row_ids_to_delete.push(row.to[0])
      delete row.to
      if(target_row.to) row.to = target_row.to
    } else {
      row.name = ''
    }
  })
  return rows.filter(row => !row_ids_to_delete.includes(row.id))
}

const sql_row = merchant_id => row =>
  `(${row.id}, ${merchant_id}, 0, '${row.name}', '${[row.to].join()}', '${row.contents}')`

const to_sql = (rows, merchant_id) => {
  const header = 'INSERT INTO quick_replies (id, merchant_id, starting, name, next_quick_replies, text1)\nVALUES\n'
  return header + rows.map(sql_row(merchant_id)).join(', \n')
}


// Akshully working on the data
const xml = fs.readFileSync(FILENAME).toString()
const json = parser.parse(xml, { ignoreAttributes: false })
const cells = json.mxGraphModel.root.mxCell

const purified = cells
  .map(remove_attr(['mxGeometry', '@_style', '@_parent']))
  .filter(not_basically_empty)
  .map(value_to_text)

const rows = purified
  .filter(vertices)
  .map(prune)

const links = purified
  .filter(edges)
  .map(to_from)

const rows_linked = link_up(rows, links)
const rows_buttoned = collapse_buttons(rows_linked)
const renumbered = renumber(rows_buttoned, START_ID)
const sql = to_sql(renumbered, 15)

console.log(sql)
