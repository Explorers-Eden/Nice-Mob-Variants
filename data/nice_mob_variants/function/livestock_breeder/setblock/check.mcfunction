schedule function nice_mob_variants:livestock_breeder/setblock/check 5t

execute as @e[type=minecraft:item_display,tag=nice_mob_variants.livestock_breeder.block] at @s unless block ~ ~-.5 ~ petrified_oak_slab run function nice_mob_variants:livestock_breeder/setblock/remove
