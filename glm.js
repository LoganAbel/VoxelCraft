// Small Vector Library
// Currently EXTREMELY Slow. Mostly because of the operation overloading and the disregard for recursive calls to functions

const glm = {}

Number.prototype.type = 'number'

const overload = name => {
	glm[name] = (...args) => {
		type = args.map(v => v.type).join('_')
		let fn = glm[name][type]
		if (!fn) throw `[Err: no overload found glm.${name}.${type}]`
		return fn(...args)
	}
}

const compwise = f => (...args) => {
	const types = args.map(v => v.type)
	if (types.every(t => t == 'number'))
		return f(...args)
	if (types.every(t => t == 'vec' || t == 'number')) {
		let v = args[types.indexOf('vec')]
		return new glm._vec(v.data.map((_,i) => f(...args.map(v => v.data?.[i] ?? v))))
	}
	throw `[Err: compwise failed ${types.join('_')}]`
}

glm.add = compwise((a,b) => a+b)
glm.sub = compwise((a,b) => a-b)
glm.mul = compwise((a,b) => a*b)
glm.div = compwise((a,b) => a/b)
glm.or = compwise((a,b) => a||b)
glm.and = compwise((a,b) => a&&b)
glm.neg = compwise(x => -x)
glm.greaterThan = compwise((a,b) => +(a>b))
glm.lessThan = compwise((a,b) => +(a<b))
glm.equal = compwise((a,b) => +(a==b))
glm.mod = compwise((a,b) => a%b)
glm.floor = compwise(a => 0|a)

overload('dot')
glm.dot.vec_vec = (a,b) => glm.mul(a,b).reduce((a,b)=>a+b)
glm.dot.mat_vec = (m,v) => compwise((a,b) => glm.mul(a,b))(m.vectors, v).reduce(glm.add)

glm.mix = (a,b,t) => glm.add(a, glm.mul(glm.sub(b,a),t))
glm.abs = compwise(x => Math.abs(x))
glm.min = compwise((...args) => Math.min(...args))
glm.max = compwise((...args) => Math.max(...args))

overload('all')
glm.all.vec = v => !!v.reduce((a,b) => a&&b)

overload('any')
glm.any.vec = v => !!v.reduce((a,b) => a||b)

overload('length')
glm.length.vec = v => Math.sqrt(glm.dot(v,v))

overload('normalize')
glm.normalize.vec = v => glm.div(v, glm.length(v))

glm._vec = class {
	constructor (data) {
		this.data = data
	}
	get x () { return this.data[0] }
	get y () { return this.data[1] }
	get z () { return this.data[2] }
	set x (v) { return this.data[0] = v }
	set y (v) { return this.data[1] = v }
	set z (v) { return this.data[2] = v }
	get xyz () { return glm.vec(this.data.slice(0,3)) }
	get zxy () { 
		let [x,y,z] = this.data.slice(0,3)
		return glm.vec(z,x,y) 
	}
	get yzx () { 
		let [x,y,z] = this.data.slice(0,3)
		return glm.vec(y,z,x) 
	}
	get size () { return this.data.length }
	get type() { return 'vec' }
	reduce (f) { return this.data.reduce((a,b) => f(a,b)) }
}

glm._mat = class extends glm._vec {
	get type () { return 'mat' }
	get vectors () { return glm.vec(this.data) }
	get elements () { return compwise(v => v.data)(this.vectors).data.flat() }
}

glm.vec = (...args) => new glm._vec(args.map(arg => arg.data ?? arg).flat())
glm.mat = (...args) => new glm._mat(args)
glm.ray = (pos, dir) => ({pos, dir})
