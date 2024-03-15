let callbackids = 0

let scene1 = (pos, dim, callback) => {
	let id = callbackids ++
	scene1.callbacks[id] = callback
	scene1.worker.postMessage([pos, dim, id])
}

scene1.worker = new Worker('webworker.js')
scene1.worker.onmessage = e => {
	let [data, id] = e.data

	scene1.callbacks[id](new Uint16Array(data))
	delete scene1.callbacks[id]
}
scene1.callbacks = {}

class Volume {
	constructor(data, _dim, offset, dim) {
		this.data = data
		this._dim = _dim
		this.dim = dim ?? _dim
		this.offset = offset ?? glm.vec(0,0,0)
	}
	getp(p) { 
		return this.data[
			(p.x+this.offset.x) * this._dim.y * this._dim.z 
			+ (p.y+this.offset.y) * this._dim.z 
			+ p.z+this.offset.z
		] 
	}
	get_range(x,y,z, size) {
		let first = this.getp({x,y,z})
		let p = {};
		for(p.x = x; p.x < x + size; p.x++)
			for(p.y = y; p.y < y + size; p.y++)
				for(p.z = z; p.z < z + size; p.z++)
					if(this.getp(p) != first) return null
		return first
	}
	slice(pos, dim) {
		return new Volume(this.data, this._dim, pos, dim)
	}
}