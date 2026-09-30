schedule function nice_mob_variants:frog_feeder/setblock/check 5t

execute as @e[type=minecraft:item_display,tag=nice_mob_variants.frog_feeder.block] at @s unless block ~ ~-.5 ~ petrified_oak_slab run function nice_mob_variants:frog_feeder/setblock/remove
