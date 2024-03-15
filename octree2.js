class Octree {
	constructor (data) {
		this.data = data
		this.length = 1
		this.empty = []
		this.locked_is = []
	}

	static encode_color (color) { return color * 2 + 1 }
	static encode_children (i) { return i * 2 }

	storage_stat () { return [this.length * 8 * this.data.typelen / 1024, this.data.length * this.data.typelen / 1024] }

	get (i) {
		const data = this.data.get(i)
		return {isleaf: data & 1, data: data >> 1}
	}

	alloc() {
		let empty = this.empty.shift()
		if (empty) return empty
 		if (this.length * 8 >= this.data.length)
			throw "hit memory cap";
		return this.length++
	}

	getp (pos) {
		let childi = 0;
		while (1) {
			childi += glm.dot(glm.sub(1,glm.lessThan(pos, .5)), glm.vec(1,2,4))
			let cur = this.get(childi)
			if (cur.isleaf) return cur.data
			childi = cur.data * 8
			pos = glm.mod(glm.mul(pos, 2), 1)
		}
		return null
	}

	setp (data, pos, depth) {
		pos = glm.mul(pos, 2 ** depth)
		let is = []
		for (let i = 0; i < depth; i++) {
			let dp = glm.mod(pos, 2)
			pos = glm.floor(glm.div(pos, 2))
			is.unshift(glm.dot(dp, glm.vec(1,2,4)))
		}
		if (!glm.all(glm.equal(pos,0))) return false
		let stack = []
		let idx = is.reduce((idx, di) => {
			stack.push(idx)
			let cur = this.get(idx)
			if (cur.isleaf) {
				this.split(idx)
				let color = Octree.encode_color(cur.data)
				cur = this.get(idx)
				this.data.set(new Array(8).fill(color), cur.data*8)
			}
			return cur.data * 8 + di
		})
		this.data.set([data], idx)
		while(stack.length > 0)
			if (!this.safe_join(stack.pop())) break;
		return true
	}

	generate2(root, volume) {

		let _generate = (x,y,z,size) => {
			if (size == 1) return Octree.encode_color(volume.getp(glm.vec(x,y,z)));
			size /= 2
			let data = [0,1,2,3,4,5,6,7].map(i => _generate(x+(i&1)*size,y+((i>>1)&1)*size,z+((i>>2)&1)*size, size))
			if (data.every(v => v == data[0])) return data[0]
			
			let childreni = this.alloc()
			data.forEach((v,i) => {
				this.data.set([v], childreni*8+i)
			})
			return Octree.encode_children(childreni)
		} 

		this.data.set([_generate(0,0,0,volume.dim.x)], root)
	}

	generate(root, volume) {
		let size = volume.dim.x / 2
		let stack = []
		for(let j = 0; j < 8; j ++)
			stack.push([root * 8 + j, (j&1) * size, ((j>>1)&1) * size, ((j>>2)&1) * size])

		for (; size > 1; size /= 2) {
			let old_stack = stack
			stack = []
			old_stack.forEach(([idx,x,y,z]) => {
				let color = volume.get_range(x,y,z,size)
				if(color != null) {
					this.data.set([Octree.encode_color(color)], idx)
				} else {
					idx = this.split(idx)
					for(let j = 0; j < 8; j ++)
						stack.push([
							idx * 8 + j, 
							x + (j&1) * size/2, 
							y + ((j>>1)&1) * size/2, 
							z + ((j>>2)&1) * size/2
						])
				}
			})
		}

		stack.forEach(([idx,x,y,z]) => {
			this.data.set([Octree.encode_color(volume.getp({x,y,z}))], idx)
		})
	}

	split (i) {
		const children = this.alloc()
		this.data.set([Octree.encode_children(children)], i)
		return children
	}

	join (i) {
		const stack = [i]
		while (stack.length) {
			const i = stack.shift()
			const curr = this.get(i)
			if (curr.isleaf) continue;
			this.empty.push(curr.data)
			for (let i = 0; i < 8; i++)
				stack.unshift(curr.data*8 + i)
		}
	}

	safe_join(i) {
		if (this.locked_is.includes(i)) return false;
		let cur = this.get(i).data
		if (!this.get(cur*8).isleaf) return false;
		let children = [0,1,2,3,4,5,6,7].map(di => this.get(cur*8+di).data)
		if (children.every(v=>v==children[0])) {
			this.join(i)
			this.data.set([Octree.encode_color(children[0])], i)
		}
		return true
	}

	safe_split(i) {
		let cur = this.get(i)
		if (!cur.isleaf) return;
		this.split(i)
		let cur2 = this.get(i)
		for(let j = 0; j < 8; j++)
			this.data.set([Octree.encode_color(cur.data)], cur2.data*8+j)
	}

	trace (ray, mindepth, tMAX, fn) {
		if (ray.dir.x == 0) ray.dir.x = 1e-99
		if (ray.dir.y == 0) ray.dir.y = 1e-99
		if (ray.dir.z == 0) ray.dir.z = 1e-99

		const dir = glm.lessThan(ray.dir, 0)
		const oct_mask = glm.dot(dir, glm.vec(1,2,4))
		ray.pos = glm.mix(ray.pos, glm.sub(dir, ray.pos), dir)
		ray.dir = glm.abs(ray.dir);

		let tmin = glm.div(glm.sub(0, ray.pos), ray.dir)
		let tmax = glm.div(glm.sub(1, ray.pos), ray.dir)

		if (glm.min(tMAX, tmax.x, tmax.y, tmax.z) < glm.max(tmin.x, tmin.y, tmin.z, 0.)) return null;

		let hit = this.#trace(oct_mask, tmin, tmax, tMAX, -1, mindepth, glm.vec(0,0,0), fn)

		if (hit == null) return null;

		hit.norm = glm.mul(hit.norm, glm.sub(glm.mul(dir, 2), 1))
		hit.pos = glm.abs(glm.sub(glm.mul(dir, 2 ** mindepth - 1), hit.pos))
		hit.pos = glm.mul(hit.pos, .5 ** mindepth)

		return hit
	}

	#trace(oct_mask, tmin, tmax, tMAX, idx, iter, pos, is_hit) {
		let cur = idx == -1 ? {isleaf: 0, data: 0} : this.get(idx ^ oct_mask)

		let t = Math.max(tmin.x, tmin.y, tmin.z, 0)
		if (tMAX < t) return null;

		if (cur.isleaf) {
			if (cur.data == 0) return null
			if (!is_hit(cur.data)) return null
			for(;iter > 0;iter--) {
				let tmid = glm.mix(tmin, tmax, .5)
				let dpos = glm.greaterThan(t, tmid)
				tmin = glm.mix(tmin, tmid, dpos);
				tmax = glm.mix(tmid, tmax, dpos);
				pos = glm.add(glm.mul(pos, 2), dpos)
			}
			return {pos, norm: glm.equal(t, tmin), t}
		}

		let tmid = glm.mix(tmin, tmax, .5)

		let dpos = glm.greaterThan(t, tmid)
		tmin = glm.mix(tmin, tmid, dpos);
		tmax = glm.mix(tmid, tmax, dpos);

		while (glm.all(glm.lessThan(dpos, 2))) {
			let hit = this.#trace(oct_mask, tmin, tmax, tMAX, 
				8 * cur.data + glm.dot(dpos, glm.vec(1,2,4)), 
				iter - 1, 
				glm.add(glm.mul(pos,2), dpos),
				is_hit
			)
			if (hit != null) return hit

			let t = glm.min(tmax.x, tmax.y, tmax.z)
			let dir = glm.equal(tmax, t)
			dpos = glm.add(dpos, dir)

			let _tmax = glm.mix(tmin, tmax, glm.add(1, dir))
			tmin = glm.mix(tmin, tmax, dir)
			tmax = _tmax
		}

		return null
	}
}