// server/src/services/conversionService.js

/**
 * Unit conversion service using BFS graph traversal.
 * Handles dimension-aware conversions with memoization.
 */

const db = require('../db');
const { ValidationError } = require('../utils/errors');

// In-memory cache for conversion paths (invalidated on conversion CRUD)
const pathCache = new Map();

/**
 * Build adjacency list from unit_conversions table
 * Returns Map<fromUnitId, Map<toUnitId, { factor, ingredientId }>>
 */
function buildGraph(ingredientId = null) {
  const graph = new Map();
  
  const stmt = db.prepare(`
    SELECT from_unit_id, to_unit_id, factor, ingredient_id
    FROM unit_conversions
    WHERE ingredient_id IS NULL OR ingredient_id = ?
  `);
  
  const rows = stmt.all(ingredientId);
  
  for (const row of rows) {
    if (!graph.has(row.from_unit_id)) {
      graph.set(row.from_unit_id, new Map());
    }
    graph.get(row.from_unit_id).set(row.to_unit_id, {
      factor: row.factor,
      ingredient_id: row.ingredient_id,
    });
  }
  
  return graph;
}

/**
 * BFS to find shortest conversion path from fromUnitId to toUnitId
 * Returns array of { to_unit_id, factor } or null if no path
 */
function findPath(graph, fromUnitId, toUnitId) {
  const cacheKey = `${fromUnitId}-${toUnitId}`;
  if (pathCache.has(cacheKey)) {
    return pathCache.get(cacheKey);
  }
  
  if (fromUnitId === toUnitId) {
    return [];
  }
  
  const queue = [[fromUnitId]];
  const visited = new Set([fromUnitId]);
  
  while (queue.length > 0) {
    const path = queue.shift();
    const current = path[path.length - 1];
    
    const neighbors = graph.get(current);
    if (!neighbors) continue;
    
    for (const [next, edge] of neighbors) {
      if (visited.has(next)) continue;
      
      const newPath = [...path, next];
      
      if (next === toUnitId) {
        // Convert node path to edge path with factors
        const edgePath = [];
        for (let i = 0; i < newPath.length - 1; i++) {
          const edgeData = graph.get(newPath[i]).get(newPath[i + 1]);
          edgePath.push({ to_unit_id: newPath[i + 1], factor: edgeData.factor });
        }
        pathCache.set(cacheKey, edgePath);
        return edgePath;
      }
      
      visited.add(next);
      queue.push(newPath);
    }
  }
  
  return null; // No path found
}

/**
 * Get unit details by ID
 */
function getUnit(unitId) {
  const stmt = db.prepare('SELECT id, code, name, dimension, is_base FROM units WHERE id = ?');
  return stmt.get(unitId);
}

/**
 * Convert quantity from one unit to another
 * @param {number} qty - Quantity to convert
 * @param {number} fromUnitId - Source unit ID
 * @param {number} toUnitId - Target unit ID
 * @param {number|null} ingredientId - Optional ingredient ID for ingredient-specific conversions
 * @returns {number} - Converted quantity
 * @throws {ValidationError} - If conversion is not possible (dimension mismatch)
 */
function convert(qty, fromUnitId, toUnitId, ingredientId = null) {
  if (fromUnitId === toUnitId) {
    return qty;
  }
  
  const fromUnit = getUnit(fromUnitId);
  const toUnit = getUnit(toUnitId);
  
  if (!fromUnit || !toUnit) {
    throw new ValidationError('Invalid unit', { fromUnitId, toUnitId });
  }
  
  // Check dimension compatibility
  if (fromUnit.dimension !== toUnit.dimension) {
    throw new ValidationError('UNIT_DIMENSION_MISMATCH', {
      fromDimension: fromUnit.dimension,
      toDimension: toUnit.dimension,
      fromUnit: fromUnit.code,
      toUnit: toUnit.code,
    });
  }
  
  const graph = buildGraph(ingredientId);
  const path = findPath(graph, fromUnitId, toUnitId);
  
  if (!path) {
    throw new ValidationError('No conversion path found', { fromUnitId, toUnitId });
  }
  
  let result = qty;
  for (const step of path) {
    result *= step.factor;
  }
  
  return result;
}

/**
 * Convert quantity to base unit for an ingredient
 * @param {number} qty - Quantity in purchase unit
 * @param {number} purchaseUnitId - Purchase unit ID
 * @param {object} ingredient - Ingredient object with base_unit_id
 * @returns {number} - Quantity in base unit
 */
function toBase(qty, purchaseUnitId, ingredient) {
  return convert(qty, purchaseUnitId, ingredient.base_unit_id, ingredient.id);
}

/**
 * Convert quantity from base unit to another unit
 * @param {number} qtyBase - Quantity in base unit
 * @param {number} targetUnitId - Target unit ID
 * @param {object} ingredient - Ingredient object
 * @returns {number} - Quantity in target unit
 */
function fromBase(qtyBase, targetUnitId, ingredient) {
  return convert(qtyBase, ingredient.base_unit_id, targetUnitId, ingredient.id);
}

/**
 * Describe the conversion path between two units
 * @param {number} fromUnitId - Source unit ID
 * @param {number} toUnitId - Target unit ID
 * @returns {string|null} - Human-readable conversion description or null
 */
function describeConversion(fromUnitId, toUnitId) {
  const fromUnit = getUnit(fromUnitId);
  const toUnit = getUnit(toUnitId);
  
  if (!fromUnit || !toUnit) return null;
  
  if (fromUnitId === toUnitId) {
    return `1 ${fromUnit.code} = 1 ${toUnit.code}`;
  }
  
  if (fromUnit.dimension !== toUnit.dimension) {
    return `Cannot convert: ${fromUnit.dimension} to ${toUnit.dimension}`;
  }
  
  const graph = buildGraph();
  const path = findPath(graph, fromUnitId, toUnitId);
  
  if (!path) {
    return `No conversion path from ${fromUnit.code} to ${toUnit.code}`;
  }
  
  let totalFactor = 1;
  const steps = [];
  
  for (const step of path) {
    totalFactor *= step.factor;
    const nextUnit = getUnit(step.to_unit_id);
    steps.push(`${step.factor}x → ${nextUnit.code}`);
  }
  
  return `1 ${fromUnit.code} = ${totalFactor} ${toUnit.code} (${steps.join(', ')})`;
}

/**
 * Invalidate conversion cache (call after conversion CRUD operations)
 */
function invalidateCache() {
  pathCache.clear();
}

module.exports = {
  convert,
  toBase,
  fromBase,
  describeConversion,
  invalidateCache,
  buildGraph,
  findPath,
};
