#particles for ender variants
particle minecraft:reverse_portal ~ ~.2 ~ .4 .4 .4 0.01 1

#teleport when damaged
execute unless predicate nice_mob_variants:entity/has_no_hurttime run function nice_mob_variants:ender/teleport/init

#damage when in water/rain
execute if predicate nice_mob_variants:entity/is_wet run damage @s 0.25