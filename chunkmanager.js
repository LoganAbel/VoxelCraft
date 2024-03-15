class ChunkManager {
	constructor(camera, octree, generator, depth, chunkdepth) {
		this.camera = camera
		this.octree = octree
		this.depth = depth
		this.size = 2 ** depth
		this.chunksize = 2 ** chunkdepth
		this.pos = glm.vec(0,0,0)
		this.generator = generator
	}

	generate() {
		let chunks = [0,1,2,3,4,5,6,7]
		chunks = chunks.map(j => [j, glm.vec(j&1,(j>>1)&1,(j>>2)&1)])
		for(let _ = 0; _ < 8/7*(8 ** (this.depth-1) - 1); _++) {
			const [i, pos] = chunks.shift()
			this.octree.safe_split(i)
			let cur = this.octree.get(i)
			for(let j = 0; j < 8; j++) {
				chunks.push([
					cur.data * 8 + j,
					glm.add(glm.mul(pos, 2), glm.vec(j&1,(j>>1)&1,(j>>2)&1))
				])
			}
		}
		this.octree.locked_is.push(...chunks.map(([idx]) => idx))
		this.chunks = new Array(this.size).fill(0).map(_ => 
			new Array(this.size).fill(0).map(_ => 
				new Array(this.size)
			)
		)
		chunks.forEach(([idx, pos]) => {
			this.chunks[pos.x][pos.y][pos.z] = idx
		})
	}

	update_in_dir(signdir) {
		let t = performance.now()

		let dir = glm.abs(signdir)

		let start = glm.mul(glm.lessThan(signdir, 0), this.size-1)
		let d1 = dir.zxy
		let d2 = dir.yzx

		let pstart = glm.add(start, glm.mul(signdir, this.size-1))
		pstart = glm.mul(glm.add(pstart, this.pos), this.chunksize)
		let dim = glm.mix(this.size*this.chunksize,this.chunksize,dir)

		let attach_new_chunks = () => {
			if (volume == null) return;
			to_generate.forEach(([idx, pos]) => {
				let children = this.octree.split(idx)
				this.octree.generate(children, volume.slice(pos,glm.vec(this.chunksize, this.chunksize, this.chunksize)))
			})
			to_generate = []

			if (construct_done) {
				//console.log(`updated in ${performance.now() - t} ms`)
				this.octree.data.update()
			}
		}

		this.generator(pstart, dim, data => {
			volume = new Volume(data, dim)
			attach_new_chunks()
		})
		
		let to_generate = []
		let construct_done = 0
		let volume = null

		for(let i = 0; i < this.size; i ++)
			for(let j = 0; j < this.size; j ++) {
				let pos = glm.add(start, glm.add(glm.mul(d1,i), glm.mul(d2, j)))
				this.octree.join(this.chunks[pos.x][pos.y][pos.z])
				// get deleted chunk
				for(let _ = 0; _ < this.size-1; _ ++) {
					const newpos = glm.add(pos, signdir)
					this.octree.data.set(
						[this.octree.data.get(this.chunks[newpos.x][newpos.y][newpos.z])], 
						this.chunks[pos.x][pos.y][pos.z]
					)
					pos = newpos
				}

				let idx = this.chunks[pos.x][pos.y][pos.z]
				this.octree.data.set([Octree.encode_color(0)], idx)
				pos = glm.mul(glm.add(glm.mul(d1,i), glm.mul(d2, j)), this.chunksize)
				to_generate.push([idx, pos])
			}

		construct_done = 1
		attach_new_chunks()
		this.octree.data.update()

		//console.log(`lagtime: ${performance.now()-t} ms`)
	}

	update() {
		let shiftdir = glm.sub(glm.greaterThan(this.camera.pos, .5 + .5 / this.size), glm.lessThan(this.camera.pos, .5 - .5 / this.size))

		if(glm.all(glm.equal(shiftdir, 0))) return;

		this.camera.pos = glm.sub(this.camera.pos, glm.mul(shiftdir, 1 / this.size))
		this.pos = glm.add(this.pos, shiftdir)

		if (shiftdir.x != 0) this.update_in_dir(glm.vec(shiftdir.x,0,0))
		if (shiftdir.y != 0) this.update_in_dir(glm.vec(0,shiftdir.y,0))
		if (shiftdir.z != 0) this.update_in_dir(glm.vec(0,0,shiftdir.z))
	}
}