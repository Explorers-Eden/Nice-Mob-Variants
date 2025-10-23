schedule function nice_mob_variants:pigeon/init 5s

execute as @e[type=chicken,tag=!nice_mob_variants.pigeon] if data entity @s {variant:"nice_mob_variants:pigeon"} unless data entity @s data.nice_mob_variants.coo_pitch run function nice_mob_variants:pigeon/tag/init
execute as @e[type=chicken,tag=nice_mob_variants.pigeon] if data entity @s {variant:"nice_mob_variants:pigeon"} if data entity @s data.nice_mob_variants.coo_pitch run function nice_mob_variants:pigeon/play/init with entity @s data.nice_mob_variants