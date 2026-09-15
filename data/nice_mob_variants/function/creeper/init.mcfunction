schedule function nice_mob_variants:creeper/init 5t

execute as @e[type=item] at @s if items entity @s container.0 minecraft:acacia_button[minecraft:custom_data={nice_mob_variants: {variant_spawner: "creeper"}}] run function nice_mob_variants:creeper/exec