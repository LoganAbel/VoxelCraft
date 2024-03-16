class BoundingBox {
	constructor(pos, min, max) {
		this.pos = pos
		this.min = min
		this.max = max
	}
	* interval_slice (dir, slice, interval) {
		const slice_pos = glm.add(this.pos, glm.mix(0, glm.mix(this.min, this.max, slice), dir))
		const d1 = dir.zxy
		const d2 = dir.yzx
		let maxi = glm.dot(this.max, d1)
		let maxj = glm.dot(this.max, d2)
		let p = (i, j) => glm.add(slice_pos, glm.add(glm.mul(i, d1), glm.mul(j, d2)))
		for(let i = glm.dot(this.min, d1); i < maxi; i += interval) {
			for(let j = glm.dot(this.min, d2); j < maxj; j += interval) 
				yield p(i,j)
			yield p(i,maxj)
		}
		for(let j = glm.dot(this.min, d2); j < maxj; j += interval) 
			yield p(maxi,j)
		yield p(maxi,maxj)
	}
	* interval (interval) {
		let p = glm.vec(0,0,0)
		for(p.x = this.min.x; p.x < this.max.x; p.x += interval) {
			for(p.y = this.min.y; p.y < this.max.y; p.y += interval) {
				for(p.z = this.min.z; p.z < this.max.z; p.z += interval) {
					yield glm.add(this.pos, p)
				}
				p.z = this.max.z
				yield glm.add(this.pos, p)
			}
			p.y = this.max.y
			yield glm.add(this.pos, p)
		}
		p.x = this.max.x
		yield glm.add(this.pos, p)
	}
	intersect(min2, max2) {
		let min1 = glm.add(this.min, this.pos)
		let max1 = glm.add(this.max, this.pos)
		return glm.all(glm.lessThan(min1, max2)) && glm.all(glm.lessThan(min2, max1))
	}
}

class Camera {
	constructor(pos, set_cam, blocksize) {
		this.hitbox = new BoundingBox(
			pos,
			glm.vec(-.3 * blocksize, -1.6 * blocksize, -.3 * blocksize), 
			glm.vec(.3 * blocksize, .2 * blocksize, .3 * blocksize)
		)
		this.set_cam = set_cam
		this.rotX = 0
		this.rotY = 0.0001
		this.vel_y = 0
		this.in_flymode = false
		this.old_space = 0

		this.update()
	}

	get pos() { return this.hitbox.pos }
	set pos(newpos) { return this.hitbox.pos = newpos }

	move_vec(dp) {
		const cy = Math.cos(this.rotY)
		const sy = Math.sin(this.rotY)
		return glm.vec(
			dp.x * cy + dp.z * sy,
			dp.y,
			dp.x * -sy + dp.z * cy,
		)
	}

	mat() {
		const cx = Math.cos(this.rotX)
		const sx = Math.sin(this.rotX)
		const cy = Math.cos(this.rotY)
		const sy = Math.sin(this.rotY)
		return glm.mat(
			glm.vec( cy, 			0, 			-sy, 		0 ), 
			glm.vec( sx * sy, 		cx, 		cy * sx, 	0 ), 
			glm.vec( sy * cx, 		-sx, 		cy * cx, 	0 ), 
			glm.vec( this.pos.x, 	this.pos.y, this.pos.z, 1 )
		)
	}

	center_ray() {
		let mat = this.mat()
		return glm.ray(glm.dot(mat, glm.vec(0,0,0,1)).xyz, glm.dot(mat, glm.vec(0,0,1,0)).xyz);
	}

	update() {
		this.set_cam(false, this.mat().elements)
	}

	move_in_dir (octree, dp, blocksize) {
		const dir = glm.abs(glm.normalize(dp))
		const dist = glm.dot(dir, dp)

		const hitbox_dir = glm.mix(glm.dot(this.hitbox.min, dir), glm.dot(this.hitbox.max, dir), +(dist > 0))
		const pos_dir = glm.dot(this.pos, dir) + hitbox_dir
		const next_block = 0|(pos_dir+dist) / blocksize
		if ((0|(pos_dir+(dist>0?1:-1)*-1e-15)*blocksize) == next_block) {
			this.pos = glm.add(this.pos, dp)
			return 0
		}

		for(let pos of this.hitbox.interval_slice(dir, +(dist > 0), .999 * blocksize)) {
			let newpos = glm.add(pos, dp)
			let value = octree.getp(newpos)
			if (value != 0 && value != 1 && value != 4) {
				this.pos = glm.mix(this.pos, (next_block + (dist < 0) - (dist < 0 ? -1 : 1) * .0001) * blocksize - hitbox_dir, dir)
				return value
			}
		}
		this.pos = glm.add(this.pos, dp)
		return 0
	}

	controll (Controller, octree, dt, blocksize) {
		const [mx,my] = Controller.dmouse()
		if (Controller.locked()) {
			let speed = 4.3 * blocksize * (1 + .5 * Controller.Ctrl) * (1 - .5 * Controller.Shift) * dt / 1000
			const rot_speed = .01

			this.rotX += (my + (Controller.down - Controller.up) * .2 * dt) * rot_speed 
			this.rotY += (mx + (Controller.right - Controller.left) * .2 * dt) * rot_speed
			this.rotX = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.rotX))

			if (Controller.Space && !this.old_space) {
				if (performance.now() - this.spacetime < 250) {
					this.vel_y = 0
					this.in_flymode = !this.in_flymode
				}
				this.spacetime = performance.now()
			}

			const in_blocks = [...this.hitbox.interval(.999 * blocksize)].map(p => octree.getp(p))

			const in_water = in_blocks.some(block => block == 1 || block == 4)

			let dy;
			if (this.in_flymode) {
				speed *= 1.5
				dy = (Controller.Space-Controller.Shift) * speed
			} else if (in_water) {	
				const below_tread_level = 
					[...this.hitbox.interval_slice(glm.vec(0,1,0), .1, .999 * blocksize)]
					.map(p => octree.getp(p))
					.some(block => block == 1 || block == 4)

				speed *= .6
				this.vel_y -= 5 * dt / 1000
				if (below_tread_level && Controller.Space)
					this.vel_y += 15 * dt / 1000
				if (Controller.Shift)
					this.vel_y = - 256 * dt / 1000
				this.vel_y *= .1 ** (dt / 1000)
				dy = this.vel_y * blocksize * dt / 1000
			} else {
				this.vel_y -= 30 * dt / 1000
				this.vel_y = Math.max(-64, this.vel_y)
				this.vel_y *= .7 ** (dt / 1000)
				dy = this.vel_y * blocksize * dt / 1000
			}

			let move = this.move_vec(glm.vec(
				(Controller.d-Controller.a) * speed, 
				dy, 
				(Controller.w-Controller.s) * speed
			))

			if (move.x != 0) this.move_in_dir(octree, glm.vec(move.x,0,0), blocksize)
			if (move.y != 0) {
				let hit = this.move_in_dir(octree, glm.vec(0,move.y,0), blocksize)
				if (hit != 0) {
					this.vel_y = 0
					if (Controller.Space && !in_water) this.vel_y = 9
					this.in_flymode = false
				}
			}
			if (move.z != 0) this.move_in_dir(octree, glm.vec(0,0,move.z), blocksize)

			this.update()

			this.old_space = Controller.Space
		}
	}
}
